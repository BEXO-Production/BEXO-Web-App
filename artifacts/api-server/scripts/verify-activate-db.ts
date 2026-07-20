/**
 * DB integration check for activatePaidPlan (save → mutate → assert → restore).
 * Usage: pnpm exec tsx scripts/verify-activate-db.ts [handle]
 */
import { db, users, subscriptions, profiles } from "@workspace/db";
import { eq, or } from "drizzle-orm";
import {
  ANNUAL_STORAGE_BYTES,
  LIFETIME_STORAGE_BYTES,
  activatePaidPlan,
  addAnnualTerm,
  resolveSubscriptionState,
} from "../src/lib/subscriptions";

const handle = (process.argv[2] || "kavin").toLowerCase();

async function main() {
  const [profile] = await db
    .select()
    .from(profiles)
    .where(or(eq(profiles.handle, handle), eq(profiles.subdomain, handle)))
    .limit(1);
  if (!profile) throw new Error(`No profile for ${handle}`);

  const userId = profile.userId;
  const [userBefore] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const [subBefore] = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1);
  if (!userBefore) throw new Error("User missing");

  const restore = async () => {
    await db
      .update(users)
      .set({
        storageQuotaBytes: userBefore.storageQuotaBytes,
        storageBonusBytes: userBefore.storageBonusBytes ?? 0,
      })
      .where(eq(users.id, userId));
    if (subBefore) {
      await db
        .update(subscriptions)
        .set({
          plan: subBefore.plan,
          status: subBefore.status,
          expiresAt: subBefore.expiresAt,
        })
        .where(eq(subscriptions.userId, userId));
    }
  };

  try {
    // Seed lifetime with 0 bonus
    if (subBefore) {
      await db
        .update(subscriptions)
        .set({ plan: "lifetime", status: "active", expiresAt: null })
        .where(eq(subscriptions.userId, userId));
    } else {
      await db.insert(subscriptions).values({
        userId,
        plan: "lifetime",
        status: "active",
        expiresAt: null,
      });
    }
    await db
      .update(users)
      .set({ storageQuotaBytes: LIFETIME_STORAGE_BYTES, storageBonusBytes: 0 })
      .where(eq(users.id, userId));

    const stacked = await activatePaidPlan(userId, "annual", null);
    if (!stacked.stacked) throw new Error("Expected stacked=true for lifetime→annual");
    if (stacked.plan !== "lifetime") throw new Error("Plan should stay lifetime");
    if (stacked.storageBonusBytes !== ANNUAL_STORAGE_BYTES) throw new Error("Bonus should be +100MB");
    if (stacked.storageQuotaBytes !== LIFETIME_STORAGE_BYTES + ANNUAL_STORAGE_BYTES) {
      throw new Error(`Expected 600MB quota, got ${stacked.storageQuotaBytes}`);
    }
    console.log("OK  lifetime → annual add-on stacks to 600MB");

    // Annual renew: switch to annual, renew, quota unchanged
    const expires = addAnnualTerm(new Date());
    await db
      .update(subscriptions)
      .set({ plan: "annual", status: "active", expiresAt: expires })
      .where(eq(subscriptions.userId, userId));
    await db
      .update(users)
      .set({ storageQuotaBytes: ANNUAL_STORAGE_BYTES, storageBonusBytes: 0 })
      .where(eq(users.id, userId));

    const newExpiry = addAnnualTerm(expires);
    const renewed = await activatePaidPlan(userId, "annual", newExpiry);
    if (renewed.stacked) throw new Error("Renew should not stack");
    if (renewed.storageQuotaBytes !== ANNUAL_STORAGE_BYTES) throw new Error("Renew must keep 100MB");
    if (renewed.renewalMode !== "renew") throw new Error("renewalMode should be renew");
    console.log("OK  annual → annual renew keeps 100MB");

    const state = await resolveSubscriptionState(userId);
    if (state.canBuy.lifetime !== false) throw new Error("Active annual must hide lifetime");
    if (state.canBuy.annual !== true) throw new Error("Active annual must allow yearly");
    console.log("OK  canBuy for active annual = yearly only");

    console.log("\nDB activate checks passed.");
  } finally {
    await restore();
    console.log("Restored original subscription/storage for", handle);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
