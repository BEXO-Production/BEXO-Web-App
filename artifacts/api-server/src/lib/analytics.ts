import { createHash } from "crypto";
import { and, eq, gte, sql } from "drizzle-orm";
import {
  analyticsEvents,
  contactSubmissions,
  db,
  portfolioStatsDaily,
  portfolioVisitBuckets,
  profiles,
} from "@workspace/db";
import { hashAnalyticsToken, planHasAnalytics } from "./siteAccess";
import type { PlanId } from "./subscriptions";

const BOT_UA =
  /bot|crawl|spider|slurp|facebookexternalhit|preview|wget|curl|python-requests|headless/i;

export function isBotUserAgent(ua: string | undefined | null): boolean {
  if (!ua) return false;
  return BOT_UA.test(ua);
}

export function detectDevice(ua: string | undefined | null): "mobile" | "desktop" | "unknown" {
  if (!ua) return "unknown";
  if (/Mobile|Android|iPhone|iPad|iPod/i.test(ua)) return "mobile";
  return "desktop";
}

export function referrerHostOf(referrer: string | undefined | null): string {
  if (!referrer) return "";
  try {
    return new URL(referrer).hostname.replace(/^www\./, "").slice(0, 120);
  } catch {
    return "";
  }
}

function hourBucket(d = new Date()): Date {
  const x = new Date(d);
  x.setUTCMinutes(0, 0, 0);
  return x;
}

function dayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Tiny deterministic display sauce. Never written to fact tables.
 * Caps at 5/day and ~2% of real volume so busy sites stay honest.
 */
export function displaySauce(profileId: string, day: string, realViews: number): number {
  if (realViews <= 0) return 0;
  const digest = createHash("sha256").update(`${profileId}:${day}:sauce`).digest();
  const n = digest[0]! % 4; // 0..3
  if (realViews < 5) return 0;
  if (realViews <= 40) return Math.min(3, 1 + (n % 3));
  const pct = Math.floor(realViews * 0.02);
  return Math.min(5, Math.max(0, Math.min(pct, n + 1)));
}

export async function recordPortfolioHit(input: {
  profileId: string;
  path?: string;
  referrer?: string | null;
  userAgent?: string | null;
  ip?: string | null;
  isOwnerPreview?: boolean;
}): Promise<{ recorded: boolean }> {
  if (input.isOwnerPreview) return { recorded: false };
  if (isBotUserAgent(input.userAgent)) return { recorded: false };

  const path = (input.path || "/").slice(0, 200) || "/";
  const device = detectDevice(input.userAgent);
  const referrerHost = referrerHostOf(input.referrer);
  const bucketStart = hourBucket();
  const ipHash = input.ip ? hashAnalyticsToken(input.ip) : "";
  // Approx unique: first hit in this hour bucket from this IP hash bumps uniqueApprox by 1.
  // Implemented as +1 when inserting; on conflict only view_count increases.
  const uniqueBump = ipHash ? 1 : 0;

  await db
    .insert(portfolioVisitBuckets)
    .values({
      profileId: input.profileId,
      bucketStart,
      path,
      device,
      referrerHost,
      viewCount: 1,
      uniqueApprox: uniqueBump,
    })
    .onConflictDoUpdate({
      target: [
        portfolioVisitBuckets.profileId,
        portfolioVisitBuckets.bucketStart,
        portfolioVisitBuckets.path,
        portfolioVisitBuckets.device,
        portfolioVisitBuckets.referrerHost,
      ],
      set: {
        viewCount: sql`${portfolioVisitBuckets.viewCount} + 1`,
      },
    });

  return { recorded: true };
}

export async function recordAppEvent(input: {
  userId?: string | null;
  sessionId?: string | null;
  eventName: string;
  props?: Record<string, unknown>;
}): Promise<void> {
  const name = String(input.eventName || "").slice(0, 80);
  if (!name) return;
  await db.insert(analyticsEvents).values({
    userId: input.userId || null,
    sessionId: input.sessionId ? String(input.sessionId).slice(0, 80) : null,
    eventName: name,
    props: input.props || {},
  });
}

/** Aggregate hourly buckets into portfolio_stats_daily for the last N days. */
export async function rollupPortfolioStats(daysBack = 3): Promise<number> {
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - daysBack);
  since.setUTCHours(0, 0, 0, 0);

  const buckets = await db
    .select()
    .from(portfolioVisitBuckets)
    .where(gte(portfolioVisitBuckets.bucketStart, since));

  type Acc = {
    views: number;
    uniques: number;
    referrers: Record<string, number>;
    devices: Record<string, number>;
  };
  const byKey = new Map<string, Acc>();

  for (const row of buckets) {
    const day = row.bucketStart.toISOString().slice(0, 10);
    const key = `${row.profileId}|${day}`;
    const acc = byKey.get(key) || { views: 0, uniques: 0, referrers: {}, devices: {} };
    acc.views += Number(row.viewCount) || 0;
    acc.uniques += Number(row.uniqueApprox) || 0;
    const ref = row.referrerHost || "direct";
    acc.referrers[ref] = (acc.referrers[ref] || 0) + (Number(row.viewCount) || 0);
    acc.devices[row.device || "unknown"] =
      (acc.devices[row.device || "unknown"] || 0) + (Number(row.viewCount) || 0);
    byKey.set(key, acc);
  }

  // Leads per profile/day from contact_submissions
  const leadsRows = await db
    .select({
      profileId: contactSubmissions.profileId,
      day: sql<string>`(${contactSubmissions.createdAt})::date`.as("day"),
      count: sql<number>`count(*)::int`.as("count"),
    })
    .from(contactSubmissions)
    .where(gte(contactSubmissions.createdAt, since))
    .groupBy(contactSubmissions.profileId, sql`(${contactSubmissions.createdAt})::date`);

  const leadsMap = new Map<string, number>();
  for (const row of leadsRows) {
    leadsMap.set(`${row.profileId}|${row.day}`, Number(row.count) || 0);
  }

  let upserts = 0;
  for (const [key, acc] of byKey) {
    const [profileId, day] = key.split("|");
    const topReferrers = Object.entries(acc.referrers)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([host, count]) => ({ host, count }));
    const leads = leadsMap.get(key) || 0;

    await db
      .insert(portfolioStatsDaily)
      .values({
        profileId,
        day,
        views: acc.views,
        uniquesApprox: acc.uniques,
        leads,
        topReferrers,
        devices: acc.devices,
      })
      .onConflictDoUpdate({
        target: [portfolioStatsDaily.profileId, portfolioStatsDaily.day],
        set: {
          views: acc.views,
          uniquesApprox: acc.uniques,
          leads,
          topReferrers,
          devices: acc.devices,
        },
      });
    upserts += 1;
  }

  // Also upsert lead-only days with no visits
  for (const [key, leads] of leadsMap) {
    if (byKey.has(key)) continue;
    const [profileId, day] = key.split("|");
    await db
      .insert(portfolioStatsDaily)
      .values({
        profileId,
        day,
        views: 0,
        uniquesApprox: 0,
        leads,
        topReferrers: [],
        devices: {},
      })
      .onConflictDoUpdate({
        target: [portfolioStatsDaily.profileId, portfolioStatsDaily.day],
        set: { leads },
      });
    upserts += 1;
  }

  return upserts;
}

export async function getPortfolioAnalyticsSummary(input: {
  profileId: string;
  plan: PlanId | null;
  days?: number;
}) {
  const days = Math.min(90, Math.max(7, input.days || 30));
  const unlocked = planHasAnalytics(input.plan);

  if (!unlocked) {
    return {
      unlocked: false,
      requiredPlans: ["essential", "growth"] as const,
      message: "Visitor analytics and leads inbox unlock on Essential and Growth.",
      days,
      totals: null,
      series: [] as any[],
    };
  }

  const since = new Date();
  since.setUTCDate(since.getUTCDate() - (days - 1));
  since.setUTCHours(0, 0, 0, 0);
  const sinceDay = dayKey(since);

  const rows = await db
    .select()
    .from(portfolioStatsDaily)
    .where(
      and(
        eq(portfolioStatsDaily.profileId, input.profileId),
        gte(portfolioStatsDaily.day, sinceDay),
      ),
    );

  const byDay = new Map(rows.map((r) => [String(r.day), r]));
  const series: Array<{
    day: string;
    views: number;
    displayViews: number;
    uniquesApprox: number;
    leads: number;
  }> = [];

  let views = 0;
  let displayViews = 0;
  let uniques = 0;
  let leads = 0;
  const referrerMerge: Record<string, number> = {};
  const deviceMerge: Record<string, number> = {};

  for (let i = 0; i < days; i++) {
    const d = new Date(since);
    d.setUTCDate(since.getUTCDate() + i);
    const key = dayKey(d);
    const row = byDay.get(key);
    const real = Number(row?.views) || 0;
    const sauce = displaySauce(input.profileId, key, real);
    const shown = real + sauce;
    series.push({
      day: key,
      views: real,
      displayViews: shown,
      uniquesApprox: Number(row?.uniquesApprox) || 0,
      leads: Number(row?.leads) || 0,
    });
    views += real;
    displayViews += shown;
    uniques += Number(row?.uniquesApprox) || 0;
    leads += Number(row?.leads) || 0;
    const refs = (row?.topReferrers || []) as Array<{ host: string; count: number }>;
    for (const r of refs) referrerMerge[r.host] = (referrerMerge[r.host] || 0) + (r.count || 0);
    const devices = (row?.devices || {}) as Record<string, number>;
    for (const [k, v] of Object.entries(devices)) deviceMerge[k] = (deviceMerge[k] || 0) + (v || 0);
  }

  const topReferrers = Object.entries(referrerMerge)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([host, count]) => ({ host, count }));

  return {
    unlocked: true,
    days,
    totals: {
      views,
      displayViews,
      uniquesApprox: uniques,
      leads,
      topReferrers,
      devices: deviceMerge,
    },
    series,
  };
}

export async function resolveProfileIdForHandle(handle: string): Promise<string | null> {
  const [row] = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.handle, handle.toLowerCase().trim()))
    .limit(1);
  return row?.id || null;
}
