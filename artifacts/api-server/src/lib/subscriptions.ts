import { db, subscriptions, users } from "@workspace/db";
import { and, eq } from "drizzle-orm";

export const FREE_STORAGE_BYTES = 10 * 1024 * 1024;
export const PRO_STORAGE_BYTES = 50 * 1024 * 1024;

type SubscriptionRecord = typeof subscriptions.$inferSelect;

export type SubscriptionState = {
  subscription: SubscriptionRecord | null;
  plan: "annual" | "lifetime" | null;
  status: "free" | "active" | "expired";
  isPremium: boolean;
  expiresAt: Date | null;
  storageQuotaBytes: number;
};

export const addAnnualTerm = (from: Date = new Date()) => {
  const next = new Date(from);
  next.setFullYear(next.getFullYear() + 1);
  return next;
};

export async function resolveSubscriptionState(userId: string): Promise<SubscriptionState> {
  const [subscription] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .limit(1);

  const now = new Date();
  const hasExpired =
    subscription?.status === "active" &&
    subscription.expiresAt !== null &&
    subscription.expiresAt.getTime() <= now.getTime();

  if (hasExpired) {
    await db
      .update(subscriptions)
      .set({ status: "expired" })
      .where(and(eq(subscriptions.userId, userId), eq(subscriptions.status, "active")));
    await db.update(users).set({ storageQuotaBytes: FREE_STORAGE_BYTES }).where(eq(users.id, userId));

    return {
      subscription: { ...subscription, status: "expired" },
      plan: null,
      status: "expired",
      isPremium: false,
      expiresAt: subscription.expiresAt,
      storageQuotaBytes: FREE_STORAGE_BYTES,
    };
  }

  const isPremium = subscription?.status === "active" && (subscription.plan === "annual" || subscription.plan === "lifetime");
  const storageQuotaBytes = isPremium ? PRO_STORAGE_BYTES : FREE_STORAGE_BYTES;

  return {
    subscription: subscription || null,
    plan: isPremium ? (subscription.plan as "annual" | "lifetime") : null,
    status: isPremium ? "active" : subscription?.status === "expired" ? "expired" : "free",
    isPremium: !!isPremium,
    expiresAt: subscription?.expiresAt || null,
    storageQuotaBytes,
  };
}

export async function syncStorageQuota(userId: string, quotaBytes: number, currentQuota?: number | null) {
  if (currentQuota === quotaBytes) return;
  await db.update(users).set({ storageQuotaBytes: quotaBytes }).where(eq(users.id, userId));
}
