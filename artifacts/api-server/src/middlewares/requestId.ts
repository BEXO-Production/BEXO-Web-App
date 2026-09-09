import { randomUUID } from "node:crypto";
import type { Request, Response, NextFunction } from "express";

/** Only accept an inbound id that looks like one — a header is attacker-controlled
 * and ends up in every log line for the request. */
const SAFE_ID = /^[A-Za-z0-9_.:-]{8,128}$/;

/**
 * Assigns a correlation id to every request, echoed back as `X-Request-Id`.
 *
 * Clients surface it on error screens, so a user-reported "something went wrong"
 * maps to exact log lines. Must run before pino-http so the logger picks up `req.id`.
 */
export function requestId(req: Request, res: Response, next: NextFunction): void {
  const inbound = req.headers["x-request-id"];
  const candidate = Array.isArray(inbound) ? inbound[0] : inbound;
  const id = candidate && SAFE_ID.test(candidate) ? candidate : randomUUID();

  (req as Request & { id?: string }).id = id;
  res.setHeader("X-Request-Id", id);
  next();
}
