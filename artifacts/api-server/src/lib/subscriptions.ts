import { addonSubscriptions, db, profiles, subscriptions, users } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { invalidatePortfolioRenderCache } from "./portfolioRenderCache";

export const FREE_STORAGE_BYTES = 10 * 1024 * 1024;
export const STORAGE_BLOCK_BYTES = 50 * 1024 * 1024; // storage add-on block size

// Fallback base quotas when the pricing catalog row is unavailable.
const PLAN_BASE_QUOTA: Record<string, number> = {
  free: FREE_STORAGE_BYTES,
  identity: 50 * 1024 * 1024,
  essential: 100 * 1024 * 1024,
  growth: 100 * 1024 * 1024,
  studentplus: 50 * 1024 * 1024,
};

// Autopay renewals extend expiry through webhooks; allow a short grace window
// so a slow webhook does not bounce a paying user back to Free mid-cycle.
const AUTOPAY_GRACE_MS = 48 * 60 * 60 * 1000;

type SubscriptionRecord = typeof subscriptions.$inferSelect;
type AddonRecord = typeof addonSubscriptions.$inferSelect;

export type PaidPlan = "identity" | "essential" | "growth" | "studentplus";
export type PlanId = PaidPlan | "free";
export type BillingPeriod = "free" | "monthly" | "yearly" | "lifetime";
export type RenewalMode = "purchase" | "renew";

export const PAID_PLANS: PaidPlan[] = ["identity", "essential", "growth", "studentplus"];
export const SUBSCRIPTION_PLANS: PaidPlan[] = ["identity", "essential", "growth"]; // Razorpay autopay
export const ORDER_PLANS: PaidPlan[] = ["studentplus"]; // one-time payment

export function isPaidPlan(value: unknown): value is PaidPlan {
  return typeof value === "string" && (PAID_PLANS as string[]).includes(value);
}

/** Map legacy plan ids (annual/lifetime) onto the new catalog. */
export function normalizePlanId(plan: string | null | undefined): PlanId | null {
  if (!plan) return null;
  if (plan === "annual") return "growth";
  if (plan === "lifetime") return "studentplus";
  if (plan === "free") return "free";
  return isPaidPlan(plan) ? plan : null;
}

export function planBillingPeriod(plan: PlanId | null | undefined): BillingPeriod {
  if (plan === "identity" || plan === "essential") return "monthly";
  if (plan === "growth") return "yearly";
  if (plan === "studentplus") return "lifetime";
  return "free";
}

export type CanBuy = {
  identity: boolean;
  essential: boolean;
  growth: boolean;
  studentplus: boolean;
  storage: boolean;
  /** Legacy aliases kept for older clients during rollout */
  annual: boolean;
  lifetime: boolean;
};

export type SubscriptionState = {
  subscription: SubscriptionRecord | null;
  plan: PlanId | null;
  status: "free" | "active" | "expired";
  isPremium: boolean;
  expiresAt: Date | null;
  billingPeriod: BillingPeriod;
  storageQuotaBytes: number;
  storageBonusBytes: number;
  addonBlocks: number;
  addonBytes: number;
  addon: AddonRecord | null;
  canBuy: CanBuy;
  renewalMode: RenewalMode;
};

export type ActivateResult = {
  plan: PaidPlan;
  expiresAt: Date | null;
  storageQuotaBytes: number;
  storageBonusBytes: number;
  stacked: boolean;
  renewalMode: RenewalMode;
};

export const addMonthlyTerm = (from: Date = new Date()) => {
  const next = new Date(from);
  next.setMonth(next.getMonth() + 1);
  return next;
};

export const addAnnualTerm = (from: Date = new Date()) => {
  const next = new Date(from);
  next.setFullYear(next.getFullYear() + 1);
  return next;
};

export function planTermEnd(plan: PaidPlan, from: Date = new Date()): Date | null {
  const period = planBillingPeriod(plan);
  if (period === "monthly") return addMonthlyTerm(from);
  if (period === "yearly") return addAnnualTerm(from);
  return null; // lifetime
}

export function planBaseQuota(plan: PlanId | null | undefined): number {
  const normalized = normalizePlanId(plan ?? null) || "free";
  return PLAN_BASE_QUOTA[normalized] ?? FREE_STORAGE_BYTES;
}

export function effectiveQuota(plan: PlanId | null | undefined, bonusBytes: number, addonBytes = 0): number {
  return planBaseQuota(plan) + Math.max(0, Number(bonusBytes) || 0) + Math.max(0, Number(addonBytes) || 0);
}

export function getCanBuy(isPremium: boolean, currentPlan: PlanId | null = null): CanBuy {
  // Free / expired: can buy any paid plan.
  // Active paid: allow upgrades to higher tiers only (not lateral/downgrade).
  // Storage add-on requires an active paid base plan.
  if (!isPremium) {
    return {
      identity: true,
      essential: true,
      growth: true,
      studentplus: true,
      storage: false,
      annual: true,
      lifetime: true,
    };
  }

  const rank: Record<string, number> = {
    identity: 1,
    essential: 2,
    growth: 3,
    studentplus: 2,
  };
  const current = currentPlan ? rank[currentPlan] || 0 : 0;

  return {
    identity: false,
    essential: current < rank.essential,
    growth: current < rank.growth,
    studentplus: currentPlan !== "studentplus" && currentPlan !== "growth",
    storage: true,
    annual: current < rank.growth,
    lifetime: currentPlan !== "studentplus" && currentPlan !== "growth",
  };
}

async function readBonusBytes(userId: string): Promise<number> {
  const [user] = await db
    .select({ storageBonusBytes: users.storageBonusBytes })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return Math.max(0, Number(user?.storageBonusBytes) || 0);
}

/** Addon rows that currently grant storage (active, or cancelled but still inside paid period). */
export async function getGrantingAddons(userId: string): Promise<{ rows: AddonRecord[]; totalBlocks: number }> {
  const rows = await db
    .select()
    .from(addonSubscriptions)
    .where(and(eq(addonSubscriptions.userId, userId), eq(addonSubscriptions.addon, "storage")));

  const now = Date.now();
  const granting: AddonRecord[] = [];
  let totalBlocks = 0;
  for (const row of rows) {
    const withinPeriod = !row.currentEnd || row.currentEnd.getTime() + AUTOPAY_GRACE_MS > now;
    const grants =
      (row.status === "active" && withinPeriod) ||
      (row.status === "cancelled" && row.currentEnd !== null && row.currentEnd.getTime() > now);
    if (!grants) continue;
    granting.push(row);
    totalBlocks += Math.max(0, Number(row.blocks) || 0);
  }
  return { rows: granting, totalBlocks };
}

/** Latest storage add-on row that still grants blocks (for cancel / display of primary link). */
export async function getActiveAddon(userId: string): Promise<AddonRecord | null> {
  const { rows } = await getGrantingAddons(userId);
  let best: AddonRecord | null = null;
  for (const row of rows) {
    if (!best || (row.updatedAt?.getTime() || 0) > (best.updatedAt?.getTime() || 0)) best = row;
  }
  return best;
}

/** Billing control plane for storage add-ons (grant vs autopay can differ). */
export async function getStorageAddonControl(userId: string): Promise<{
  grantingBlocks: number;
  hasAutopay: boolean;
  primaryAutopay: AddonRecord | null;
}> {
  const { rows, totalBlocks } = await getGrantingAddons(userId);
  const activeRows = rows.filter((r) => r.status === "active");
  const primaryAutopay =
    activeRows.sort((a, b) => (b.updatedAt?.getTime() || 0) - (a.updatedAt?.getTime() || 0))[0] ?? null;
  return {
    grantingBlocks: totalBlocks,
    hasAutopay: activeRows.length > 0,
    primaryAutopay,
  };
}

export async function resolveSubscriptionState(userId: string): Promise<SubscriptionState> {
  const [subscription] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .limit(1);

  const bonusBytes = await readBonusBytes(userId);
  const { totalBlocks: addonBlocks, rows: grantingAddons } = await getGrantingAddons(userId);
  const addon = grantingAddons.length
    ? grantingAddons.reduce((best, row) =>
        !best || (row.updatedAt?.getTime() || 0) > (best.updatedAt?.getTime() || 0) ? row : best,
      )
    : null;
  const addonBytes = addonBlocks * STORAGE_BLOCK_BYTES;

  const now = new Date();
  const normalizedPlan = normalizePlanId(subscription?.plan);
  const graceMs = subscription?.razorpaySubscriptionId ? AUTOPAY_GRACE_MS : 0;
  const hasExpired =
    subscription?.status === "active" &&
    subscription.expiresAt !== null &&
    subscription.expiresAt.getTime() + graceMs <= now.getTime();

  if (hasExpired) {
    const quota = effectiveQuota("free", bonusBytes, addonBytes);
    await db
      .update(subscriptions)
      .set({ status: "expired" })
      .where(and(eq(subscriptions.userId, userId), eq(subscriptions.status, "active")));
    await db
      .update(users)
      .set({
        storageQuotaBytes: quota,
        cancelAtPeriodEnd: false,
        templateId: "minimal",
        siteStatus: "paused",
        pauseReason: "subscription_ended",
      })
      .where(eq(users.id, userId));
    const [expiredProfile] = await db
      .select({ handle: profiles.handle })
      .from(profiles)
      .where(eq(profiles.userId, userId))
      .limit(1);
    await db
      .update(profiles)
      .set({ isPremium: false, templateId: "minimal" })
      .where(eq(profiles.userId, userId));
    if (expiredProfile?.handle) {
      invalidatePortfolioRenderCache(String(expiredProfile.handle));
    }

    return {
      subscription: { ...subscription, status: "expired" },
      plan: null,
      status: "expired",
      isPremium: false,
      expiresAt: subscription.expiresAt,
      billingPeriod: "free",
      storageQuotaBytes: quota,
      storageBonusBytes: bonusBytes,
      addonBlocks,
      addonBytes,
      addon,
      canBuy: getCanBuy(false, null),
      renewalMode: "purchase",
    };
  }

  const isPremium = subscription?.status === "active" && isPaidPlan(normalizedPlan);
  const plan: PlanId | null = isPremium
    ? (normalizedPlan as PaidPlan)
    : normalizedPlan === "free"
      ? "free"
      : null;
  const storageQuotaBytes = effectiveQuota(isPremium ? plan : "free", bonusBytes, addonBytes);
  const status: SubscriptionState["status"] = isPremium
    ? "active"
    : subscription?.status === "expired"
      ? "expired"
      : "free";

  return {
    subscription: subscription || null,
    plan,
    status,
    isPremium: !!isPremium,
    expiresAt: subscription?.expiresAt || null,
    billingPeriod: planBillingPeriod(isPremium ? plan : "free"),
    storageQuotaBytes,
    storageBonusBytes: bonusBytes,
    addonBlocks,
    addonBytes,
    addon,
    canBuy: getCanBuy(!!isPremium, plan),
    renewalMode: isPremium && plan && normalizedPlan === plan ? "renew" : "purchase",
  };
}

export async function syncStorageQuota(userId: string, quotaBytes: number, currentQuota?: number | null) {
  if (currentQuota === quotaBytes) return;
  await db.update(users).set({ storageQuotaBytes: quotaBytes }).where(eq(users.id, userId));
}

/** Recompute and persist the user's total quota (base + bonus + addon blocks). */
export async function recomputeUserQuota(userId: string): Promise<number> {
  const state = await resolveSubscriptionState(userId);
  await db.update(users).set({ storageQuotaBytes: state.storageQuotaBytes }).where(eq(users.id, userId));
  // Storage pause / remount is reconciled inside resolveSiteAccess.
  try {
    const { resolveSiteAccess } = await import("./siteAccess");
    await resolveSiteAccess(userId);
  } catch {
    // Avoid circular import failures blocking quota updates.
  }
  return state.storageQuotaBytes;
}

/**
 * Apply a paid plan purchase or renewal.
 * - Same plan active → extend expiry (renew)
 * - Different plan / free / expired → switch to the purchased plan
 * Legacy stacked bonus bytes are preserved; add-on storage is tracked separately.
 */
export async function activatePaidPlan(
  userId: string,
  purchasedPlanRaw: PaidPlan | "annual" | "lifetime",
  expiresAt: Date | null,
  razorpayLink?: { subscriptionId?: string | null; planId?: string | null },
): Promise<ActivateResult> {
  const purchasedPlan = (normalizePlanId(purchasedPlanRaw) || "growth") as PaidPlan;
  const state = await resolveSubscriptionState(userId);
  const renewalMode: RenewalMode = state.isPremium && state.plan === purchasedPlan ? "renew" : "purchase";
  const nextExpires = planBillingPeriod(purchasedPlan) === "lifetime" ? null : expiresAt;

  const quotaBytes = effectiveQuota(purchasedPlan, state.storageBonusBytes, state.addonBytes);

  // Only autopay purchases carry a Razorpay subscription id; a one-time order
  // (Student+) must not clobber an existing link.
  const linkUpdates: Partial<typeof subscriptions.$inferInsert> = {};
  if (razorpayLink?.subscriptionId !== undefined) {
    linkUpdates.razorpaySubscriptionId = razorpayLink.subscriptionId;
  }
  if (razorpayLink?.planId !== undefined) {
    linkUpdates.razorpayPlanId = razorpayLink.planId;
  }

  const existing = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1);
  if (existing.length > 0) {
    await db
      .update(subscriptions)
      .set({ plan: purchasedPlan, status: "active", expiresAt: nextExpires, ...linkUpdates })
      .where(eq(subscriptions.userId, userId));
  } else {
    await db.insert(subscriptions).values({
      userId,
      plan: purchasedPlan,
      status: "active",
      expiresAt: nextExpires,
      ...linkUpdates,
    });
  }

  await db
    .update(users)
    .set({
      storageQuotaBytes: quotaBytes,
      cancelAtPeriodEnd: false,
      paymentFailedAt: null,
      graceUntil: null,
      siteStatus: "live",
      pauseReason: null,
    })
    .where(eq(users.id, userId));

  // Promote profile + premium template + invalidate render cache.
  try {
    const { upgradeUserToPremiumLive } = await import("./adminOps");
    await upgradeUserToPremiumLive(userId, { preferKeepTemplate: true });
  } catch {
    await db
      .update(profiles)
      .set({ isPremium: true })
      .where(eq(profiles.userId, userId));
  }

  return {
    plan: purchasedPlan,
    expiresAt: nextExpires,
    storageQuotaBytes: quotaBytes,
    storageBonusBytes: state.storageBonusBytes,
    stacked: false,
    renewalMode,
  };
}

export async function getRenewalExpiry(userId: string, planRaw: PaidPlan | "annual" | "lifetime"): Promise<Date | null> {
  const plan = (normalizePlanId(planRaw) || "growth") as PaidPlan;
  if (planBillingPeriod(plan) === "lifetime") return null;

  const state = await resolveSubscriptionState(userId);
  const start =
    state.isPremium &&
    state.plan === plan &&
    state.subscription?.expiresAt &&
    state.subscription.expiresAt.getTime() > Date.now()
      ? state.subscription.expiresAt
      : new Date();

  return planTermEnd(plan, start);
}
