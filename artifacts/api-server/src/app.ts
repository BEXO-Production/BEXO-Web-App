import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { subdomainRouter } from "./middlewares/subdomainRouter";
import { renderPortfolioForHandle } from "./middlewares/subdomainRouter";

const app: Express = express();

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
app.use(cors());
app.use(express.json());
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));

// Subdomain Gateway Router MUST come before other routes
app.use(subdomainRouter);

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
    frontendUrl: "http://localhost:5173"
  });
});

app.use("/api", router);

export default app;
