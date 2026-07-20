import { db, subscriptions, users } from "@workspace/db";
import { and, eq } from "drizzle-orm";

export const FREE_STORAGE_BYTES = 10 * 1024 * 1024;
export const ANNUAL_STORAGE_BYTES = 100 * 1024 * 1024; // Yearly base
export const LIFETIME_STORAGE_BYTES = 500 * 1024 * 1024; // Lifetime base — Yearly add-on stacks +100MB



type SubscriptionRecord = typeof subscriptions.$inferSelect;
export type PaidPlan = "annual" | "lifetime";
export type RenewalMode = "purchase" | "renew" | "addon";

export type SubscriptionState = {
  subscription: SubscriptionRecord | null;
  plan: "annual" | "lifetime" | "free" | null;
  status: "free" | "active" | "expired";
  isPremium: boolean;
  expiresAt: Date | null;
  storageQuotaBytes: number;
  storageBonusBytes: number;
  canBuy: { annual: boolean; lifetime: boolean };
  renewalMode: RenewalMode;
};

export type ActivateResult = {
  plan: "annual" | "lifetime";
  expiresAt: Date | null;
  storageQuotaBytes: number;
  storageBonusBytes: number;
  stacked: boolean;
  renewalMode: RenewalMode;
};

export const addAnnualTerm = (from: Date = new Date()) => {
  const next = new Date(from);
  next.setFullYear(next.getFullYear() + 1);
  return next;
};

export function planBaseQuota(plan: "annual" | "lifetime" | "free" | null | undefined): number {
  if (plan === "annual") return ANNUAL_STORAGE_BYTES;
  if (plan === "lifetime") return LIFETIME_STORAGE_BYTES;
  return FREE_STORAGE_BYTES;
}

export function effectiveQuota(plan: "annual" | "lifetime" | "free" | null | undefined, bonusBytes: number): number {
  return planBaseQuota(plan) + Math.max(0, Number(bonusBytes) || 0);
}

export function getCanBuy(isPremium: boolean, plan: SubscriptionState["plan"]): { annual: boolean; lifetime: boolean } {
  // Annual is always available: purchase, renew, or lifetime storage add-on.
  // Lifetime only when not already on an active paid plan.
  return {
    annual: true,
    lifetime: !isPremium,
  };
}

export function getRenewalMode(isPremium: boolean, plan: SubscriptionState["plan"]): RenewalMode {
  if (isPremium && plan === "annual") return "renew";
  if (isPremium && plan === "lifetime") return "addon";
  return "purchase";
}

async function readBonusBytes(userId: string): Promise<number> {
  const [user] = await db
    .select({ storageBonusBytes: users.storageBonusBytes })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return Math.max(0, Number(user?.storageBonusBytes) || 0);
}

export async function resolveSubscriptionState(userId: string): Promise<SubscriptionState> {
  const [subscription] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .limit(1);

  const bonusBytes = await readBonusBytes(userId);
  const now = new Date();
  const hasExpired =
    subscription?.status === "active" &&
    subscription.expiresAt !== null &&
    subscription.expiresAt.getTime() <= now.getTime();

  if (hasExpired) {
    const quota = effectiveQuota("free", bonusBytes);
    await db
      .update(subscriptions)
      .set({ status: "expired" })
      .where(and(eq(subscriptions.userId, userId), eq(subscriptions.status, "active")));
    await db.update(users).set({ storageQuotaBytes: quota }).where(eq(users.id, userId));

    return {
      subscription: { ...subscription, status: "expired" },
      plan: null,
      status: "expired",
      isPremium: false,
      expiresAt: subscription.expiresAt,
      storageQuotaBytes: quota,
      storageBonusBytes: bonusBytes,
      canBuy: getCanBuy(false, null),
      renewalMode: "purchase",
    };
  }

  const isPremium =
    subscription?.status === "active" && (subscription.plan === "annual" || subscription.plan === "lifetime");
  const plan: SubscriptionState["plan"] = isPremium
    ? (subscription.plan as "annual" | "lifetime")
    : subscription?.plan === "free"
      ? "free"
      : null;
  const storageQuotaBytes = effectiveQuota(isPremium ? plan : "free", bonusBytes);
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
    storageQuotaBytes,
    storageBonusBytes: bonusBytes,
    canBuy: getCanBuy(!!isPremium, plan),
    renewalMode: getRenewalMode(!!isPremium, plan),
  };
}

export async function syncStorageQuota(userId: string, quotaBytes: number, currentQuota?: number | null) {
  if (currentQuota === quotaBytes) return;
  await db.update(users).set({ storageQuotaBytes: quotaBytes }).where(eq(users.id, userId));
}

/**
 * Apply a paid plan with renew / stack rules:
 * - Free/expired → annual|lifetime: set base plan quota
 * - Active annual → annual: extend expiry only (no storage change)
 * - Active lifetime → annual: keep lifetime, add annual storage as bonus
 * - Lifetime purchase: set lifetime base (bonus preserved)
 */
export async function activatePaidPlan(
  userId: string,
  purchasedPlan: PaidPlan,
  expiresAt: Date | null,
): Promise<ActivateResult> {
  const state = await resolveSubscriptionState(userId);
  let bonusBytes = state.storageBonusBytes;
  let nextPlan: "annual" | "lifetime" = purchasedPlan;
  let nextExpires = expiresAt;
  let stacked = false;
  let renewalMode: RenewalMode = "purchase";

  if (purchasedPlan === "annual" && state.isPremium && state.plan === "lifetime") {
    // Storage add-on on top of lifetime
    nextPlan = "lifetime";
    nextExpires = null;
    bonusBytes += ANNUAL_STORAGE_BYTES;
    stacked = true;
    renewalMode = "addon";
  } else if (purchasedPlan === "annual" && state.isPremium && state.plan === "annual") {
    // Renew: keep plan + bonus; expiry already computed by caller
    nextPlan = "annual";
    nextExpires = expiresAt;
    renewalMode = "renew";
  } else if (purchasedPlan === "lifetime") {
    nextPlan = "lifetime";
    nextExpires = null;
    renewalMode = "purchase";
  } else {
    // Free / expired → annual (restore annual base)
    nextPlan = "annual";
    nextExpires = expiresAt;
    renewalMode = "purchase";
  }

  const quotaBytes = effectiveQuota(nextPlan, bonusBytes);

  const existing = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1);
  if (existing.length > 0) {
    await db
      .update(subscriptions)
      .set({ plan: nextPlan, status: "active", expiresAt: nextExpires })
      .where(eq(subscriptions.userId, userId));
  } else {
    await db.insert(subscriptions).values({
      userId,
      plan: nextPlan,
      status: "active",
      expiresAt: nextExpires,
    });
  }

  await db
    .update(users)
    .set({
      storageQuotaBytes: quotaBytes,
      storageBonusBytes: bonusBytes,
    })
    .where(eq(users.id, userId));

  return {
    plan: nextPlan,
    expiresAt: nextExpires,
    storageQuotaBytes: quotaBytes,
    storageBonusBytes: bonusBytes,
    stacked,
    renewalMode,
  };
}

export async function getRenewalExpiry(userId: string, plan: PaidPlan): Promise<Date | null> {
  if (plan === "lifetime") return null;

  const state = await resolveSubscriptionState(userId);
  // Lifetime add-on does not set an expiry on the subscription
  if (state.isPremium && state.plan === "lifetime") return null;

  const start =
    state.subscription?.plan === "annual" &&
    state.subscription.status === "active" &&
    state.subscription.expiresAt &&
    state.subscription.expiresAt.getTime() > Date.now()
      ? state.subscription.expiresAt
      : new Date();

  return addAnnualTerm(start);
}
