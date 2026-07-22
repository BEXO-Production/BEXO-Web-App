/**
 * Short-TTL in-process cache for assembled public portfolio payloads.
 * Absorbs concurrent pageviews for the same handle on one instance.
 * Edits should call invalidatePortfolioRenderCache(handle).
 */
type CacheEntry = {
  expires: number;
  payload: unknown;
};

const CACHE = new Map<string, CacheEntry>();
const DEFAULT_TTL_MS = Number(process.env.PORTFOLIO_RENDER_CACHE_MS || 20_000);
const MAX_ENTRIES = 2_000;

export function getPortfolioRenderCache<T>(key: string): T | null {
  const hit = CACHE.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expires) {
    CACHE.delete(key);
    return null;
  }
  return hit.payload as T;
}

export function setPortfolioRenderCache(key: string, payload: unknown, ttlMs = DEFAULT_TTL_MS): void {
  if (CACHE.size >= MAX_ENTRIES) {
    // Drop oldest ~10%
    let i = 0;
    const drop = Math.ceil(MAX_ENTRIES * 0.1);
    for (const k of CACHE.keys()) {
      CACHE.delete(k);
      if (++i >= drop) break;
    }
  }
  CACHE.set(key, { payload, expires: Date.now() + ttlMs });
}

export function invalidatePortfolioRenderCache(handle: string): void {
  const needle = String(handle || "").toLowerCase().trim();
  if (!needle) return;
  for (const k of CACHE.keys()) {
    if (k === needle || k.startsWith(`${needle}:`)) CACHE.delete(k);
  }
}
