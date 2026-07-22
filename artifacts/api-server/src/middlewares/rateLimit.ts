import type { Request, Response, NextFunction } from "express";

type Bucket = { count: number; resetAt: number };

/** Lightweight in-process rate limiter (per Cloud Run instance). Pair with REDIS + edge limits in prod. */
export function createRateLimiter(options: {
  windowMs: number;
  max: number;
  keyFn?: (req: Request) => string;
  message?: string;
}) {
  const buckets = new Map<string, Bucket>();
  const keyFn =
    options.keyFn ||
    ((req: Request) => {
      const xf = req.headers["x-forwarded-for"];
      const ip =
        (typeof xf === "string" ? xf.split(",")[0]?.trim() : undefined) ||
        req.ip ||
        req.socket.remoteAddress ||
        "unknown";
      return `${req.method}:${req.path}:${ip}`;
    });

  // Opportunistic cleanup
  setInterval(() => {
    const now = Date.now();
    for (const [k, b] of buckets) {
      if (b.resetAt <= now) buckets.delete(k);
    }
  }, Math.min(options.windowMs, 60_000)).unref?.();

  return function rateLimit(req: Request, res: Response, next: NextFunction): void {
    const key = keyFn(req);
    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + options.windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    res.setHeader("X-RateLimit-Limit", String(options.max));
    res.setHeader("X-RateLimit-Remaining", String(Math.max(0, options.max - bucket.count)));
    if (bucket.count > options.max) {
      res.status(429).json({
        error: options.message || "Too many requests. Please slow down and try again.",
        code: "RATE_LIMITED",
      });
      return;
    }
    next();
  };
}
