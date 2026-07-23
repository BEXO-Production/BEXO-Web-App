import { and, eq, isNotNull } from "drizzle-orm";
import { db, profiles, users } from "@workspace/db";
import {
  appOrigin,
  pathPortfolioOrigin,
  pathPortfolioUrl,
  PLATFORM_DOMAIN,
  portfolioPublicUrl,
} from "./platform";

export type SitemapEntry = {
  loc: string;
  lastmod?: string;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: number;
};

const RESERVED_HANDLES = new Set([
  "www",
  "api",
  "app",
  "admin",
  "dashboard",
  "login",
  "billing",
  "static",
  "assets",
  "favicon",
  "og-default",
  "robots",
  "sitemap",
]);

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function formatLastmod(date: Date | null | undefined): string | undefined {
  if (!date || Number.isNaN(date.getTime())) return undefined;
  return date.toISOString().slice(0, 10);
}

export function getStaticSitemapEntries(origin = appOrigin()): SitemapEntry[] {
  const base = origin.replace(/\/$/, "");
  const today = new Date().toISOString().slice(0, 10);
  return [
    { loc: `${base}/`, lastmod: today, changefreq: "weekly", priority: 1 },
    { loc: `${base}/terms`, lastmod: today, changefreq: "monthly", priority: 0.4 },
    { loc: `${base}/privacy`, lastmod: today, changefreq: "monthly", priority: 0.4 },
    { loc: `${base}/refund`, lastmod: today, changefreq: "monthly", priority: 0.3 },
    { loc: `${base}/cookies`, lastmod: today, changefreq: "monthly", priority: 0.3 },
    {
      loc: `https://bexo-demo.${PLATFORM_DOMAIN}/`,
      lastmod: today,
      changefreq: "weekly",
      priority: 0.7,
    },
  ];
}

export async function getPortfolioSitemapEntries(): Promise<SitemapEntry[]> {
  const rows = await db
    .select({
      handle: profiles.handle,
      isPremium: profiles.isPremium,
      completedAt: users.onboardingCompletedAt,
      openToHire: users.openToHire,
    })
    .from(profiles)
    .innerJoin(users, eq(profiles.userId, users.id))
    .where(and(isNotNull(profiles.handle), isNotNull(users.onboardingCompletedAt)));

  const origin = pathPortfolioOrigin().replace(/\/$/, "");
  const entries: SitemapEntry[] = [];

  for (const row of rows) {
    const handle = String(row.handle || "")
      .toLowerCase()
      .trim();
    if (!handle || RESERVED_HANDLES.has(handle)) continue;

    const lastmod = formatLastmod(row.completedAt);
    const premium = !!row.isPremium;
    const portfolioUrl = premium ? portfolioPublicUrl(handle) : pathPortfolioUrl(handle);

    entries.push({
      loc: portfolioUrl,
      lastmod,
      changefreq: "weekly",
      priority: premium ? 0.85 : 0.65,
    });

    if (row.openToHire) {
      entries.push({
        loc: `${origin}/hire-me/${encodeURIComponent(handle)}`,
        lastmod,
        changefreq: "monthly",
        priority: 0.55,
      });
    }
  }

  entries.sort((a, b) => a.loc.localeCompare(b.loc));
  return entries;
}

export function renderSitemapXml(entries: SitemapEntry[]): string {
  const urls = entries
    .map((entry) => {
      const parts = [
        "  <url>",
        `    <loc>${escapeXml(entry.loc)}</loc>`,
        entry.lastmod ? `    <lastmod>${escapeXml(entry.lastmod)}</lastmod>` : "",
        entry.changefreq ? `    <changefreq>${entry.changefreq}</changefreq>` : "",
        entry.priority != null ? `    <priority>${entry.priority.toFixed(2)}</priority>` : "",
        "  </url>",
      ].filter(Boolean);
      return parts.join("\n");
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;
}

export function renderSitemapIndexXml(sitemapLocs: string[]): string {
  const today = new Date().toISOString().slice(0, 10);
  const body = sitemapLocs
    .map(
      (loc) => `  <sitemap>
    <loc>${escapeXml(loc)}</loc>
    <lastmod>${today}</lastmod>
  </sitemap>`,
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</sitemapindex>`;
}
