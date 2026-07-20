#!/usr/bin/env node
/**
 * Generates static sitemap XML files into bexo-web/public for Firebase Hosting.
 * Googlebot fetches Firebase Hosting reliably; Cloud Run rewrites often show
 * "Couldn't fetch" in Search Console when Cloudflare/WAF sits in front.
 *
 * Usage: node scripts/generate-sitemaps.mjs
 */
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, "../artifacts/bexo-web/public");
const ORIGIN = "https://mybexo.cyou";
const TODAY = new Date().toISOString().slice(0, 10);

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function renderUrlset(entries) {
  const urls = entries
    .map((e) => {
      const lines = [
        "  <url>",
        `    <loc>${escapeXml(e.loc)}</loc>`,
        e.lastmod ? `    <lastmod>${escapeXml(e.lastmod)}</lastmod>` : null,
        e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : null,
        e.priority != null ? `    <priority>${Number(e.priority).toFixed(2)}</priority>` : null,
        "  </url>",
      ].filter(Boolean);
      return lines.join("\n");
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}

function renderIndex(locs) {
  const body = locs
    .map(
      (loc) => `  <sitemap>
    <loc>${escapeXml(loc)}</loc>
    <lastmod>${TODAY}</lastmod>
  </sitemap>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</sitemapindex>
`;
}

const staticEntries = [
  { loc: `${ORIGIN}/`, lastmod: TODAY, changefreq: "weekly", priority: 1 },
  { loc: `${ORIGIN}/terms`, lastmod: TODAY, changefreq: "monthly", priority: 0.4 },
  { loc: `${ORIGIN}/privacy`, lastmod: TODAY, changefreq: "monthly", priority: 0.4 },
  { loc: `${ORIGIN}/refund`, lastmod: TODAY, changefreq: "monthly", priority: 0.3 },
  { loc: `${ORIGIN}/cookies`, lastmod: TODAY, changefreq: "monthly", priority: 0.3 },
  { loc: `https://bexo-demo.mybexo.cyou/`, lastmod: TODAY, changefreq: "weekly", priority: 0.7 },
];

async function fetchPortfolioEntries() {
  try {
    const res = await fetch(`${ORIGIN}/sitemap-portfolios.xml`, {
      headers: { "User-Agent": "BEXO-sitemap-generator/1.0" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    const lastmods = [...xml.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].map((m) => m[1]);
    return locs.map((loc, i) => ({
      loc,
      lastmod: lastmods[i] || TODAY,
      changefreq: loc.includes("/hire-me/") ? "monthly" : "weekly",
      priority: loc.includes("/hire-me/") ? 0.55 : loc.includes(".mybexo.cyou") ? 0.85 : 0.65,
    }));
  } catch (err) {
    console.warn("Could not refresh portfolios from live API:", err.message);
    return [];
  }
}

mkdirSync(OUT_DIR, { recursive: true });

const portfolioEntries = await fetchPortfolioEntries();
const allEntries = [...staticEntries, ...portfolioEntries];

writeFileSync(path.join(OUT_DIR, "sitemap-static.xml"), renderUrlset(staticEntries));
writeFileSync(path.join(OUT_DIR, "sitemap-portfolios.xml"), renderUrlset(portfolioEntries));
writeFileSync(
  path.join(OUT_DIR, "sitemap.xml"),
  renderIndex([`${ORIGIN}/sitemap-static.xml`, `${ORIGIN}/sitemap-portfolios.xml`]),
);
// Combined single file — easiest for Search Console (one submission)
writeFileSync(path.join(OUT_DIR, "sitemap-all.xml"), renderUrlset(allEntries));

const robots = `# BEXO — ${ORIGIN}
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

Sitemap: ${ORIGIN}/sitemap.xml
Sitemap: ${ORIGIN}/sitemap-all.xml
`;
writeFileSync(path.join(OUT_DIR, "robots.txt"), robots);

console.log(
  `Wrote sitemaps → ${OUT_DIR} (${staticEntries.length} static, ${portfolioEntries.length} portfolio URLs)`,
);
