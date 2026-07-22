import { existsSync } from "node:fs";
import path from "node:path";
import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { subdomainRouter, marketingDemoStatic } from "./middlewares/subdomainRouter";
import { renderPortfolioForHandle } from "./middlewares/subdomainRouter";
import { registerSitemapRoutes } from "./routes/sitemap";
import { createRateLimiter } from "./middlewares/rateLimit";

const app: Express = express();

// Cloudflare Worker / load balancers set X-Forwarded-Host for portfolio subdomains.
app.set("trust proxy", true);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

const allowedOrigins = [
  process.env.FRONTEND_URL,
  process.env.WEB_URL,
  process.env.MARKETING_URL,
  "https://mybexo.com",
  "https://www.mybexo.com",
  "https://dash.mybexo.com",
  "https://dash.mybexo.cyou",
  "https://atbexo.com",
  "https://www.atbexo.com",
  "https://mybexo.cyou",
  "https://www.mybexo.cyou",
  "https://bexo-development.web.app",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
].filter(Boolean) as string[];

app.use(
  cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true); // same-origin / curl / server-to-server
      if (process.env.NODE_ENV !== "production") return cb(null, true);
      if (allowedOrigins.some((o) => origin === o || origin.endsWith(".atbexo.com") || origin.endsWith(".mybexo.com") || origin.endsWith(".mybexo.cyou"))) {
        return cb(null, true);
      }
      return cb(null, false);
    },
    credentials: true,
  }),
);

// Keep the raw body around for Razorpay webhook signature verification —
// signatures are computed over the exact bytes, not re-serialized JSON.
app.use(
  express.json({
    limit: process.env.JSON_BODY_LIMIT || "1mb",
    verify: (req, _res, buf) => {
      (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
    },
  }),
);
app.use(cookieParser());
app.use(express.urlencoded({ extended: true, limit: process.env.JSON_BODY_LIMIT || "1mb" }));

// Hot-path rate limits (per instance). Edge/CDN limits should also be configured in prod.
const authLimiter = createRateLimiter({
  windowMs: 60_000,
  max: Number(process.env.RATE_LIMIT_AUTH_PER_MIN || 30),
  message: "Too many auth attempts. Please wait a minute and try again.",
  keyFn: (req) => {
    const xf = req.headers["x-forwarded-for"];
    const ip = (typeof xf === "string" ? xf.split(",")[0]?.trim() : undefined) || req.ip || "unknown";
    return `auth:${ip}`;
  },
});
const checkHandleLimiter = createRateLimiter({
  windowMs: 60_000,
  max: Number(process.env.RATE_LIMIT_HANDLE_PER_MIN || 120),
  message: "Too many handle checks. Please slow down.",
  keyFn: (req) => {
    const xf = req.headers["x-forwarded-for"];
    const ip = (typeof xf === "string" ? xf.split(",")[0]?.trim() : undefined) || req.ip || "unknown";
    return `handle:${ip}`;
  },
});
app.use("/api/auth", authLimiter);
app.use("/api/profile/check-handle", checkHandleLimiter);
app.use("/api/profile/suggest-handle", checkHandleLimiter);

// AI marketing demo assets for landing template previews (fictional persona)
app.use("/api/marketing-demo", marketingDemoStatic);

function resolveEmailAssetsDir(): string {
  const candidates = [
    path.resolve(process.cwd(), "public", "email"),
    path.resolve(process.cwd(), "artifacts", "api-server", "public", "email"),
  ];
  return candidates.find((dir) => existsSync(dir)) || candidates[0];
}

app.use(
  "/api/email-assets",
  express.static(resolveEmailAssetsDir(), {
    maxAge: process.env.NODE_ENV === "production" ? "30d" : 0,
  }),
);

function resolveOgAssetsDir(): string {
  const candidates = [
    path.resolve(process.cwd(), "public", "og"),
    path.resolve(process.cwd(), "artifacts", "api-server", "public", "og"),
  ];
  return candidates.find((dir) => existsSync(dir)) || candidates[0];
}

app.use(
  "/api/og",
  express.static(resolveOgAssetsDir(), {
    maxAge: process.env.NODE_ENV === "production" ? "7d" : 0,
  }),
);

function resolveClaimAssetsDir(): string {
  const candidates = [
    path.resolve(process.cwd(), "public", "claim"),
    path.resolve(process.cwd(), "artifacts", "api-server", "public", "claim"),
  ];
  return candidates.find((dir) => existsSync(dir)) || candidates[0];
}

app.use(
  "/api/claim-assets",
  express.static(resolveClaimAssetsDir(), {
    maxAge: process.env.NODE_ENV === "production" ? "7d" : 0,
  }),
);

registerSitemapRoutes(app);

// Subdomain Gateway Router MUST come before other routes
app.use(subdomainRouter);

// Stable preview URL: carrying the template id in the path means every
// relative asset request keeps the same preview selection without relying on
// cookies (which hosting/CDN layers may omit).
app.use("/api/render/:handle/:templateId", async (req, res) => {
  const handle = String(req.params.handle || "").toLowerCase();
  const templateId = String(req.params.templateId || "").toLowerCase();
  const basePath =
    `/api/render/${encodeURIComponent(handle)}/${encodeURIComponent(templateId)}`;
  const pathname = req.originalUrl.split("?")[0];

  if (pathname === basePath) {
    res.redirect(308, `${basePath}/`);
    return;
  }

  await renderPortfolioForHandle(req, res, handle, {
    basePath,
    requestPath: req.path,
    templateOverride: templateId,
  });
});

// Same rendering engine exposed under the main app for dashboard previews and
// path-based portfolio links. The trailing slash is required for relative
// template assets to resolve beneath /api/render/:handle/.
app.use("/api/render/:handle", async (req, res) => {
  const handle = String(req.params.handle || "").toLowerCase();
  const basePath = `/api/render/${encodeURIComponent(handle)}`;
  const pathname = req.originalUrl.split("?")[0];

  if (pathname === basePath) {
    const query = req.originalUrl.includes("?")
      ? req.originalUrl.slice(req.originalUrl.indexOf("?"))
      : "";
    res.redirect(308, `${basePath}/${query}`);
    return;
  }

  await renderPortfolioForHandle(req, res, handle, {
    basePath,
    requestPath: req.path,
  });
});

app.get("/", (req, res) => {
  res.json({
    status: "ok",
    message: "BEXO API Server is running.",
    frontendUrl:
      process.env.FRONTEND_URL ||
      process.env.WEB_URL ||
      `https://${process.env.PLATFORM_DOMAIN || "atbexo.com"}`,
  });
});

app.use("/api", router);

export default app;
