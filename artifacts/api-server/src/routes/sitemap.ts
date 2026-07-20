import type { Express } from "express";
import { appOrigin } from "../lib/platform";
import {
  getPortfolioSitemapEntries,
  getStaticSitemapEntries,
  renderSitemapXml,
} from "../lib/sitemap";

const CACHE = "public, max-age=3600, s-maxage=3600";

export function registerSitemapRoutes(app: Express) {
  const origin = appOrigin().replace(/\/$/, "");

  app.get("/api/public/sitemap-urls.json", async (_req, res) => {
    try {
      const entries = [
        ...getStaticSitemapEntries(origin),
        ...(await getPortfolioSitemapEntries()),
      ];
      res
        .status(200)
        .set("Content-Type", "application/json; charset=utf-8")
        .set("Cache-Control", CACHE)
        .json({ entries });
    } catch {
      res.status(500).json({ error: "Sitemap URL list failed" });
    }
  });

  app.get("/sitemap.xml", async (_req, res) => {
    try {
      const entries = [
        ...getStaticSitemapEntries(origin),
        ...(await getPortfolioSitemapEntries()),
      ];
      const xml = renderSitemapXml(entries);
      res
        .status(200)
        .set("Content-Type", "application/xml; charset=utf-8")
        .set("Cache-Control", CACHE)
        .send(xml);
    } catch {
      res.status(500).type("text/plain").send("Sitemap generation failed.");
    }
  });

  app.get("/sitemap-static.xml", (_req, res) => {
    const xml = renderSitemapXml(getStaticSitemapEntries(origin));
    res
      .status(200)
      .set("Content-Type", "application/xml; charset=utf-8")
      .set("Cache-Control", CACHE)
      .send(xml);
  });

  app.get("/sitemap-portfolios.xml", async (_req, res) => {
    try {
      const entries = await getPortfolioSitemapEntries();
      const xml = renderSitemapXml(entries);
      res
        .status(200)
        .set("Content-Type", "application/xml; charset=utf-8")
        .set("Cache-Control", CACHE)
        .send(xml);
    } catch (err) {
      res.status(500).type("text/plain").send("Sitemap generation failed.");
    }
  });

  app.get("/robots.txt", (_req, res) => {
    const body = `Sitemap: ${origin}/sitemap.xml

User-agent: *
Allow: /
Disallow: /dashboard
Disallow: /billing
Disallow: /welcome
Disallow: /login
Disallow: /step/
Disallow: /api/
`;
    res
      .status(200)
      .set("Content-Type", "text/plain; charset=utf-8")
      .set("Cache-Control", CACHE)
      .send(body);
  });
}
