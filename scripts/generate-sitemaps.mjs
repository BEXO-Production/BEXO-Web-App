#!/usr/bin/env node
/**
 * Generates Google-standard sitemap.xml (single urlset) + robots.txt for Firebase Hosting.
 * https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap
 *
 * Usage: node scripts/generate-sitemaps.mjs
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, "../artifacts/bexo-web/public");
const ORIGIN = "https://atbexo.com";
const TODAY = new Date().toISOString().slice(0, 10);

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Google-recommended: UTF-8, LF endings, xmlns on urlset, loc required */
function renderUrlset(entries) {
  const urls = entries
    .map((e) => {
      const lines = [
        "  <url>",
        `    <loc>${escapeXml(e.loc)}</loc>`,
        e.lastmod ? `    <lastmod>${escapeXml(e.lastmod)}</lastmod>` : null,
        "  </url>",
      ].filter(Boolean);
      return lines.join("\n");
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

const staticEntries = [
  { loc: `${ORIGIN}/`, lastmod: TODAY },
  { loc: `${ORIGIN}/terms`, lastmod: TODAY },
  { loc: `${ORIGIN}/privacy`, lastmod: TODAY },
  { loc: `${ORIGIN}/refund`, lastmod: TODAY },
  { loc: `${ORIGIN}/cookies`, lastmod: TODAY },
  { loc: `https://bexo-demo.atbexo.com/`, lastmod: TODAY },
];

function parseUrlsetXml(xml) {
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  const lastmods = [...xml.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].map((m) => m[1]);
  return locs.map((loc, i) => ({ loc, lastmod: lastmods[i] || TODAY }));
}

async function fetchPortfolioEntries() {
  try {
    const res = await fetch(`${ORIGIN}/api/public/sitemap-urls.json`, {
      headers: { Accept: "application/json", "User-Agent": "BEXO-sitemap-generator/2.0" },
      signal: AbortSignal.timeout(20000),
    });
    if (res.ok) {
      const data = await res.json();
      const entries = Array.isArray(data.entries) ? data.entries : [];
      const staticLocs = new Set(staticEntries.map((e) => e.loc));
      return entries.filter((e) => e?.loc && !staticLocs.has(e.loc));
    }
  } catch (err) {
    console.warn("API sitemap-urls.json unavailable:", err.message);
  }

  const localPortfolio = path.join(OUT_DIR, "sitemap-portfolios.xml");
  if (existsSync(localPortfolio)) {
    return parseUrlsetXml(readFileSync(localPortfolio, "utf8"));
  }

  try {
    const res = await fetch(`${ORIGIN}/sitemap-portfolios.xml`, {
      headers: { "User-Agent": "BEXO-sitemap-generator/2.0" },
      signal: AbortSignal.timeout(15000),
    });
    if (res.ok) return parseUrlsetXml(await res.text());
  } catch (err) {
    console.warn("Could not refresh portfolios:", err.message);
  }
  return [];
}

mkdirSync(OUT_DIR, { recursive: true });

const portfolioEntries = await fetchPortfolioEntries();
const allEntries = [...staticEntries, ...portfolioEntries];

writeFileSync(path.join(OUT_DIR, "sitemap.xml"), renderUrlset(allEntries), "utf8");
writeFileSync(path.join(OUT_DIR, "sitemap-static.xml"), renderUrlset(staticEntries), "utf8");
writeFileSync(path.join(OUT_DIR, "sitemap-portfolios.xml"), renderUrlset(portfolioEntries), "utf8");

const robots = `Sitemap: ${ORIGIN}/sitemap.xml

User-agent: *
Allow: /
Disallow: /dashboard
Disallow: /billing
Disallow: /welcome
Disallow: /login
Disallow: /step/
Disallow: /api/
`;
writeFileSync(path.join(OUT_DIR, "robots.txt"), robots, "utf8");

console.log(
  `Wrote sitemap.xml (urlset) → ${OUT_DIR} (${staticEntries.length} static + ${portfolioEntries.length} portfolio URLs)`,
);
