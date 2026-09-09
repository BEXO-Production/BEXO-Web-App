import type { Request, Response, NextFunction } from "express";

/**
 * Baseline security headers, hand-rolled rather than pulling in helmet — the
 * workspace enforces a 1-day `minimumReleaseAge` on npm and this is a dozen
 * headers, matching how `rateLimit.ts` is done here.
 *
 * Framing is deliberately NOT blocked globally: the API renders portfolio HTML
 * (`/api/render/...`, subdomain router) which bexo-web embeds cross-origin in
 * preview iframes (step-7, dashboard, TemplatePreview). A blanket
 * X-Frame-Options/frame-ancestors would break every template preview, so frame
 * protection is applied only to the JSON API surface below.
 */

/** Paths that legitimately render embeddable HTML rather than JSON. */
function isEmbeddableHtmlRoute(path: string): boolean {
  return (
    path.startsWith("/api/render") ||
    path.startsWith("/api/marketing-demo") ||
    path.startsWith("/api/email-assets") ||
    path.startsWith("/api/og") ||
    path.startsWith("/api/claim-assets")
  );
}

export function securityHeaders(req: Request, res: Response, next: NextFunction): void {
  // Never let a browser sniff a JSON error body into executable HTML.
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=(), payment=()");
  res.removeHeader("X-Powered-By");

  // HSTS only when the request actually arrived over TLS — sending it on plaintext
  // local dev would pin localhost to https in the developer's browser.
  const isHttps = req.secure || req.headers["x-forwarded-proto"] === "https";
  if (isHttps && process.env.NODE_ENV === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }

  if (!isEmbeddableHtmlRoute(req.path)) {
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Content-Security-Policy", "frame-ancestors 'none'");
  }

  next();
}
