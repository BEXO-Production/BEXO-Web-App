import { eq } from "drizzle-orm";
import { db, users } from "@workspace/db";
import { logger } from "./logger";
import { enqueueEmail } from "./emailOutbox";
import { expireGraceWindows } from "./siteAccess";
import { rollupPortfolioStats } from "./analytics";
import { expireStaleAwaitingMandates, sweepUnrefundedAutopayVerifications } from "./billingEngine";
import { appOrigin } from "./platform";
import { purgeAbandonedPhoneOnlyUsers } from "./userRetention";

async function enqueueDunningEmail(userId: string, graceUntil: Date, dayBucket: 0 | 7 | 14) {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user?.email) return;
  const pauseDate = graceUntil.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  await enqueueEmail({
    eventType: "payment_failed",
    recipient: user.email,
    subject:
      dayBucket === 0
        ? "Action needed: BEXO auto-renew payment failed"
        : dayBucket === 7
          ? "Reminder: update billing to keep your portfolio live"
          : "Final notice: portfolio will pause soon",
    dedupeKey: `payment_failed:${userId}:${graceUntil.toISOString().slice(0, 10)}:d${dayBucket}`,
    userId,
    payload: {
      userName: user.name || "there",
      billingUrl: `${appOrigin()}/billing`,
      pauseDate,
      dayBucket,
    },
  });
}

export type DailyJobHooks = {
  cancelSubscription?: (subscriptionId: string) => Promise<void>;
  refundPayment?: (
    paymentId: string,
    amountPaise: number,
  ) => Promise<{ id: string } | null>;
  fetchPayment?: (
    paymentId: string,
  ) => Promise<{ amountPaise: number; amountRefundedPaise: number; status: string } | null>;
};

/**
 * Grace expiry + day-7/14 dunning + analytics rollup + stale mandate sweep.
 * Called from secured cron route and an in-process daily tick.
 */
export async function runDailyBillingAndAnalyticsJob(hooks: DailyJobHooks = {}) {
  const expired = await expireGraceWindows(500);
  const rolled = await rollupPortfolioStats(3);

  const mandateSweep = await expireStaleAwaitingMandates({
    limit: 100,
    cancelSubscription: hooks.cancelSubscription || (async () => undefined),
    refundPayment: hooks.refundPayment || (async () => null),
  });

  // Guarantee the ₹1 Autopay verification debit is always returned.
  const verificationSweep = hooks.fetchPayment && hooks.refundPayment
    ? await sweepUnrefundedAutopayVerifications({
        fetchPayment: hooks.fetchPayment,
        refundPayment: hooks.refundPayment,
        limit: 50,
      })
    : { checked: 0, refunded: 0, errors: 0 };

  const phoneOnlyPurge = await purgeAbandonedPhoneOnlyUsers({ olderThanDays: 7, limit: 200 });

  const graceUsers = await db
    .select()
    .from(users)
    .where(eq(users.siteStatus, "grace"))
    .limit(500);
  const now = Date.now();
  let dunning = 0;
  for (const u of graceUsers) {
    if (!u.paymentFailedAt || !u.graceUntil) continue;
    const daysSince = Math.floor((now - u.paymentFailedAt.getTime()) / (24 * 60 * 60 * 1000));
    if (daysSince >= 14) {
      await enqueueDunningEmail(u.id, u.graceUntil, 14);
      dunning += 1;
    } else if (daysSince >= 7) {
      await enqueueDunningEmail(u.id, u.graceUntil, 7);
      dunning += 1;
    }
  }

  logger.info(
    { expired, rolled, dunning, mandateSweep, verificationSweep, phoneOnlyPurge },
    "Daily billing/analytics job completed",
  );
  return { ok: true as const, expired, rolled, dunning, mandateSweep, verificationSweep, phoneOnlyPurge };
}
