import type { Request, Response, NextFunction } from "express";
import { logger } from "../lib/logger";

/**
 * Error envelope shared by every client (web + Expo mobile).
 *
 * Shape is `application/problem+json` (RFC 7807) *plus* a legacy `error` string,
 * because both consumers already read one of those:
 *   - `lib/api-client-react/custom-fetch.ts` builds its message from title/detail/message/error
 *   - existing bexo-web pages read `errorData.error` directly
 * Emitting both keeps old callers working while giving new ones structured fields.
 */
export interface ProblemDetails {
  type: string;
  title: string;
  detail: string;
  status: number;
  code: string;
  requestId?: string;
  /** Legacy field — existing bexo-web pages read this. */
  error: string;
}

/** Thrown by route handlers when they want a specific status + client-safe message. */
export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly expose: boolean;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code ?? defaultCodeForStatus(status);
    // 4xx messages are written for users; 5xx messages may leak internals.
    this.expose = status < 500;
  }
}

function defaultCodeForStatus(status: number): string {
  switch (status) {
    case 400:
      return "BAD_REQUEST";
    case 401:
      return "UNAUTHENTICATED";
    case 403:
      return "FORBIDDEN";
    case 404:
      return "NOT_FOUND";
    case 409:
      return "CONFLICT";
    case 429:
      return "RATE_LIMITED";
    default:
      return status >= 500 ? "INTERNAL_ERROR" : "REQUEST_FAILED";
  }
}

function titleForStatus(status: number): string {
  if (status === 400) return "Invalid request";
  if (status === 401) return "Sign in required";
  if (status === 403) return "Not allowed";
  if (status === 404) return "Not found";
  if (status === 409) return "Conflict";
  if (status === 429) return "Too many requests";
  if (status >= 500) return "Something went wrong";
  return "Request failed";
}

/** 404 for unmatched /api routes — without this Express returns an HTML page that clients can't parse. */
export function notFoundHandler(req: Request, res: Response): void {
  const problem: ProblemDetails = {
    type: "about:blank",
    title: "Not found",
    detail: `No route matches ${req.method} ${req.path}.`,
    status: 404,
    code: "NOT_FOUND",
    requestId: getRequestId(req),
    error: `No route matches ${req.method} ${req.path}.`,
  };
  res.status(404).type("application/problem+json").json(problem);
}

function getRequestId(req: Request): string | undefined {
  const id = (req as Request & { id?: string | number }).id;
  return id === undefined ? undefined : String(id);
}

/**
 * Terminal error middleware. Must be registered LAST, after all routes.
 * Express only treats a 4-arg function as an error handler, so `_next` is required
 * even though it is unused.
 */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const isHttpError = err instanceof HttpError;
  const status = isHttpError ? err.status : 500;
  const requestId = getRequestId(req);

  // Log server faults loudly, client faults quietly — a wave of 400s is noise, a 500 is a page.
  const log = status >= 500 ? logger.error.bind(logger) : logger.warn.bind(logger);
  log(
    { err, requestId, method: req.method, path: req.path, status },
    status >= 500 ? "Unhandled error in request" : "Request failed",
  );

  // Headers already flushed (e.g. a streaming response failed midway) — the socket
  // must just be closed; writing a body here would corrupt the response.
  if (res.headersSent) {
    res.end();
    return;
  }

  const safeDetail =
    isHttpError && err.expose
      ? err.message
      : "An unexpected error occurred. Please try again — if it keeps happening, contact support.";

  const problem: ProblemDetails = {
    type: "about:blank",
    title: titleForStatus(status),
    detail: safeDetail,
    status,
    code: isHttpError ? err.code : "INTERNAL_ERROR",
    requestId,
    error: safeDetail,
  };

  res.status(status).type("application/problem+json").json(problem);
}
