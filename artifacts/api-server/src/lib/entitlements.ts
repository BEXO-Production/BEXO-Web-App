import { db, users } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { getPlanById } from "./pricingCatalog";
import { resolveSubscriptionState, type PlanId, type SubscriptionState } from "./subscriptions";

/**
 * Single source of truth for per-plan limits (storage / AI parses / updates),
 * read from the pricing catalog with hard-coded fallbacks.
 */

export const ONBOARDING_PARSE_LIMIT = 1; // successful parses during onboarding, for everyone
export const LIMIT_WINDOW_DAYS = 30;

export type PlanLimits = {
  planId: PlanId;
  planDisplay: string;
  storageBytes: number;
  parsesPerMonth: number;
  updatesPerMonth: number;
};

const FALLBACK_LIMITS: Record<PlanId, { parses: number; updates: number; display: string }> = {
  free: { parses: 0, updates: 1, display: "Free" },
  identity: { parses: 1, updates: 3, display: "Identity" },
  essential: { parses: 3, updates: 10, display: "Essential" },
  growth: { parses: 3, updates: 10, display: "Growth" },
  studentplus: { parses: 1, updates: 3, display: "Student+" },
};

export async function getPlanLimits(planId: PlanId | null | undefined): Promise<PlanLimits> {
  const effective: PlanId = planId && planId !== "free" ? planId : "free";
  const fallback = FALLBACK_LIMITS[effective] || FALLBACK_LIMITS.free;
  const row = await getPlanById(effective);
  return {
    planId: effective,
    planDisplay: row?.displayName || fallback.display,
    storageBytes: row?.storageBytes ?? 10 * 1024 * 1024,
    parsesPerMonth: row?.parsesPerMonth ?? fallback.parses,
    updatesPerMonth: row?.updatesPerMonth ?? fallback.updates,
  };
}

export type UserEntitlements = {
  state: SubscriptionState;
  limits: PlanLimits;
};

export async function getUserEntitlements(userId: string): Promise<UserEntitlements> {
  const state = await resolveSubscriptionState(userId);
  const limits = await getPlanLimits(state.isPremium ? state.plan : "free");
  return { state, limits };
}

export type UsageWindow = {
  used: number;
  limit: number;
  remaining: number;
  daysToReset: number;
};

function windowFrom(resetAt: Date | null | undefined, now: Date): { diffDays: number; expired: boolean } {
  const reset = resetAt ? new Date(resetAt) : now;
  const diffDays = Math.floor((now.getTime() - reset.getTime()) / (1000 * 60 * 60 * 24));
  return { diffDays, expired: diffDays >= LIMIT_WINDOW_DAYS };
}

/**
 * Read (and lazily reset) the monthly profile-updates window for a user.
 */
export async function getUpdatesUsage(
  user: { id: string; updatesThisMonth?: number | null; lastUpdatesReset?: Date | null },
  limit: number,
): Promise<UsageWindow> {
  const now = new Date();
  let used = Number(user.updatesThisMonth) || 0;
  const { diffDays, expired } = windowFrom(user.lastUpdatesReset, now);

  if (expired && used > 0) {
    used = 0;
    await db
      .update(users)
      .set({ updatesThisMonth: 0, lastUpdatesReset: now })
      .where(eq(users.id, user.id));
  }

  return {
    used,
    limit,
    remaining: Math.max(0, limit - used),
    daysToReset: expired ? LIMIT_WINDOW_DAYS : Math.max(LIMIT_WINDOW_DAYS - diffDays, 1),
  };
}

export async function consumeUpdate(userId: string, limit: number): Promise<boolean> {
  // Atomic: only increment when under the monthly cap (closes TOCTOU under parallel posts).
  const updated = await db
    .update(users)
    .set({ updatesThisMonth: sql`coalesce(${users.updatesThisMonth}, 0) + 1` })
    .where(
      and(
        eq(users.id, userId),
        sql`coalesce(${users.updatesThisMonth}, 0) < ${limit}`,
      ),
    )
    .returning({ id: users.id });
  return updated.length > 0;
}

/**
 * Read (and lazily reset) the monthly AI-parse window for a user.
 */
export async function getParsesUsage(
  user: { id: string; resumeParsesThisMonth?: number | null; lastResumeParseReset?: Date | null },
  limit: number,
): Promise<UsageWindow> {
  const now = new Date();
  let used = Number(user.resumeParsesThisMonth) || 0;
  const { diffDays, expired } = windowFrom(user.lastResumeParseReset, now);

  if (expired && used > 0) {
    used = 0;
    await db
      .update(users)
      .set({ resumeParsesThisMonth: 0, lastResumeParseReset: now })
      .where(eq(users.id, user.id));
  }

  return {
    used,
    limit,
    remaining: Math.max(0, limit - used),
    daysToReset: expired ? LIMIT_WINDOW_DAYS : Math.max(LIMIT_WINDOW_DAYS - diffDays, 1),
  };
}
