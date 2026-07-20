import type { Express } from "express";
import { appOrigin } from "../lib/platform";
import {
  getPortfolioSitemapEntries,
  getStaticSitemapEntries,
  renderSitemapIndexXml,
  renderSitemapXml,
} from "../lib/sitemap";

const CACHE = "public, max-age=3600, s-maxage=3600";

export function registerSitemapRoutes(app: Express) {
  const origin = appOrigin().replace(/\/$/, "");

  app.get("/sitemap.xml", (_req, res) => {
    const xml = renderSitemapIndexXml([
      `${origin}/sitemap-static.xml`,
      `${origin}/sitemap-portfolios.xml`,
    ]);
    res
      .status(200)
      .set("Content-Type", "application/xml; charset=utf-8")
      .set("Cache-Control", CACHE)
      .send(xml);
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
    const body = `# BEXO — ${origin}
User-agent: *
Allow: /
Allow: /sitemap.xml
Allow: /sitemap-static.xml
Allow: /sitemap-portfolios.xml
Allow: /sitemap-all.xml
Disallow: /dashboard
Disallow: /billing
Disallow: /welcome
Disallow: /login
Disallow: /step/
Disallow: /api/

Sitemap: ${origin}/sitemap.xml
Sitemap: ${origin}/sitemap-all.xml
`;
    res
      .status(200)
      .set("Content-Type", "text/plain; charset=utf-8")
      .set("Cache-Control", CACHE)
      .send(body);
  });
}
