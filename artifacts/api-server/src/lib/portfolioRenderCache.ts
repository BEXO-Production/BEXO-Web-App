/**
 * Short-TTL cache for assembled public portfolio payloads.
 * Memory map is always on (single-instance + warm path).
 * When REDIS_URL is set, also mirrors entries for multi-instance Cloud Run.
 */
import Redis from "ioredis";
import { logger } from "./logger";

type CacheEntry = {
  expires: number;
  payload: unknown;
};

const CACHE = new Map<string, CacheEntry>();
const DEFAULT_TTL_MS = Number(process.env.PORTFOLIO_RENDER_CACHE_MS || 20_000);
const MAX_ENTRIES = 2_000;
const REDIS_PREFIX = "bexo:prc:";

let redis: Redis | null = null;

function getRedis(): Redis | null {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  if (redis) return redis;
  try {
    redis = new Redis(url, {
      maxRetriesPerRequest: 1,
      enableReadyCheck: true,
      lazyConnect: false,
    });
    redis.on("error", (err) => {
      logger.warn({ err: err?.message || err }, "portfolioRenderCache Redis error");
    });
    return redis;
  } catch (err: any) {
    logger.warn({ err: err?.message || err }, "portfolioRenderCache Redis unavailable");
    return null;
  }
}

export function getPortfolioRenderCache<T>(key: string): T | null {
  const hit = CACHE.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expires) {
    CACHE.delete(key);
    return null;
  }
  return hit.payload as T;
}

/** Prefer sync memory; optionally hydrate from Redis for multi-instance. */
export async function getPortfolioRenderCacheAsync<T>(key: string): Promise<T | null> {
  const local = getPortfolioRenderCache<T>(key);
  if (local != null) return local;

  const client = getRedis();
  if (!client) return null;
  try {
    const raw = await client.get(`${REDIS_PREFIX}${key}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { expires: number; payload: unknown };
    if (Date.now() > parsed.expires) {
      await client.del(`${REDIS_PREFIX}${key}`).catch(() => undefined);
      return null;
    }
    setPortfolioRenderCache(key, parsed.payload, Math.max(1, parsed.expires - Date.now()));
    return parsed.payload as T;
  } catch {
    return null;
  }
}

export function setPortfolioRenderCache(key: string, payload: unknown, ttlMs = DEFAULT_TTL_MS): void {
  if (CACHE.size >= MAX_ENTRIES) {
    let i = 0;
    const drop = Math.ceil(MAX_ENTRIES * 0.1);
    for (const k of CACHE.keys()) {
      CACHE.delete(k);
      if (++i >= drop) break;
    }
  }
  const expires = Date.now() + ttlMs;
  CACHE.set(key, { payload, expires });

  const client = getRedis();
  if (!client) return;
  const ttlSec = Math.max(1, Math.ceil(ttlMs / 1000));
  void client
    .set(`${REDIS_PREFIX}${key}`, JSON.stringify({ expires, payload }), "EX", ttlSec)
    .catch(() => undefined);
}

export function invalidatePortfolioRenderCache(handle: string): void {
  const needle = String(handle || "").toLowerCase().trim();
  if (!needle) return;
  for (const k of CACHE.keys()) {
    if (k === needle || k.startsWith(`${needle}:`)) CACHE.delete(k);
  }

  const client = getRedis();
  if (!client) return;
  void (async () => {
    try {
      let cursor = "0";
      do {
        const [next, keys] = await client.scan(
          cursor,
          "MATCH",
          `${REDIS_PREFIX}${needle}*`,
          "COUNT",
          50,
        );
        cursor = next;
        if (keys.length) await client.del(...keys);
      } while (cursor !== "0");
    } catch {
      // best-effort
    }
  })();
}
