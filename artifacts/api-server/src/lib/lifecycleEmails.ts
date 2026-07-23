import { and, eq, gte, isNull, lt, lte, or, sql } from "drizzle-orm";
import { db, users, profiles, payments, subscriptions } from "@workspace/db";
import { enqueueEmail } from "./emailOutbox";
import { logger } from "./logger";
import { appOrigin, portfolioPublicUrl } from "./platform";

const APP_ORIGIN = appOrigin();

export async function enqueueWelcomeEmail(userId: string, email: string, userName: string) {
  if (!email) return;
  await enqueueEmail({
    eventType: "welcome",
    recipient: email,
    subject: "Welcome to Bexo",
    dedupeKey: `welcome:${userId}`,
    userId,
    payload: { userName: userName || "there" },
  });
}

export async function enqueueSiteLiveEmail(userId: string, email: string, userName: string, handle: string) {
  if (!email || !handle) return;
  const siteUrl = portfolioPublicUrl(handle);
  await enqueueEmail({
    eventType: "site_live",
    recipient: email,
    subject: "Your Bexo site is live",
    dedupeKey: `site_live:${userId}:${handle}`,
    userId,
    relatedId: handle,
    payload: { userName: userName || "there", siteUrl },
  });
}

/**
 * Schedule recovery emails for users who linked email/Google, started
 * onboarding, then went inactive 24h+ without completing. Phone-only
 * provisional accounts are never emailed (they auto-delete after 7 days).
 */
export async function scheduleRecoveryEmails() {
  try {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const abandoned = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        lastActivity: users.lastOnboardingActivityAt,
      })
      .from(users)
      .where(
        and(
          isNull(users.onboardingCompletedAt),
          sql`${users.email} IS NOT NULL`,
          or(
            and(
              sql`${users.lastOnboardingActivityAt} IS NOT NULL`,
              lt(users.lastOnboardingActivityAt, cutoff),
            ),
            and(
              sql`${users.lastOnboardingActivityAt} IS NULL`,
              lt(users.createdAt, cutoff),
            ),
          ),
        ),
      )
      .limit(50);

    for (const user of abandoned) {
      if (!user.email) continue;
      await enqueueEmail({
        eventType: "recovery",
        recipient: user.email,
        subject: "Continue your Bexo portfolio",
        dedupeKey: `recovery:${user.id}`,
        userId: user.id,
        payload: {
          userName: user.name || "there",
          resumeUrl: `${APP_ORIGIN}/`,
        },
      });
    }
  } catch (error) {
    logger.error({ error }, "Failed scheduling recovery emails");
  }
}

/**
 * Cart abandon: pending payment older than 1h, user still eligible to buy.
 */
export async function scheduleCartRecoveryEmails() {
  try {
    const cutoff = new Date(Date.now() - 60 * 60 * 1000);
    const pending = await db
      .select({
        paymentId: payments.id,
        userId: payments.userId,
        createdAt: payments.createdAt,
        email: users.email,
        name: users.name,
        onboardingCompletedAt: users.onboardingCompletedAt,
      })
      .from(payments)
      .innerJoin(users, eq(payments.userId, users.id))
      .where(
        and(
          eq(payments.status, "pending"),
          lt(payments.createdAt, cutoff),
          sql`${users.email} IS NOT NULL`,
        ),
      )
      .limit(50);

    for (const row of pending) {
      if (!row.email || !row.createdAt) continue;

      // Skip if a successful payment was completed after this abandoned order
      const [laterSuccess] = await db
        .select({ id: payments.id })
        .from(payments)
        .where(
          and(
            eq(payments.userId, row.userId),
            eq(payments.status, "success"),
            sql`${payments.createdAt} > ${row.createdAt}`,
          ),
        )
        .limit(1);
      if (laterSuccess) continue;

      const checkoutPath = row.onboardingCompletedAt ? "/billing" : "/step/9";
      await enqueueEmail({
        eventType: "cart_recovery",
        recipient: row.email,
        subject: "Complete your Bexo Pro checkout",
        dedupeKey: `cart_recovery:${row.userId}:${row.paymentId}`,
        userId: row.userId,
        relatedId: row.paymentId,
        payload: {
          userName: row.name || "there",
          checkoutUrl: `${APP_ORIGIN}${checkoutPath}`,
        },
      });
    }
  } catch (error) {
    logger.error({ error }, "Failed scheduling cart recovery emails");
  }
}

/**
 * Renewal reminder: active paid plans with a real expiry within 14 days
 * (growth yearly, monthly identity/essential, and legacy annual).
 */
export async function scheduleRenewalReminderEmails() {
  try {
    const now = new Date();
    const windowEnd = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

    const due = await db
      .select({
        userId: subscriptions.userId,
        plan: subscriptions.plan,
        expiresAt: subscriptions.expiresAt,
        email: users.email,
        name: users.name,
      })
      .from(subscriptions)
      .innerJoin(users, eq(subscriptions.userId, users.id))
      .where(
        and(
          eq(subscriptions.status, "active"),
          sql`${subscriptions.plan} IN ('growth', 'identity', 'essential', 'annual')`,
          sql`${subscriptions.expiresAt} IS NOT NULL`,
          gte(subscriptions.expiresAt, now),
          lte(subscriptions.expiresAt, windowEnd),
          sql`${users.email} IS NOT NULL`,
        ),
      )
      .limit(50);

    for (const row of due) {
      if (!row.email || !row.expiresAt) continue;
      const expiresLabel = row.expiresAt.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
      const expiryKey = row.expiresAt.toISOString().slice(0, 10);
      const planLabel =
        row.plan === "growth" || row.plan === "annual"
          ? "Yearly"
          : row.plan === "essential"
            ? "Essential"
            : "Identity";
      await enqueueEmail({
        eventType: "renewal_reminder",
        recipient: row.email,
        subject: `Renew your Bexo ${planLabel} plan`,
        dedupeKey: `renewal_reminder:${row.userId}:${expiryKey}`,
        userId: row.userId,
        relatedId: expiryKey,
        payload: {
          userName: row.name || "there",
          renewUrl: `${APP_ORIGIN}/billing`,
          expiresLabel,
          planLabel,
        },
      });
    }
  } catch (error) {
    logger.error({ error }, "Failed scheduling renewal reminder emails");
  }
}

/** Run all lifecycle email schedulers (onboarding, cart, renewal). */
export async function scheduleLifecycleEmails() {
  await scheduleRecoveryEmails();
  await scheduleCartRecoveryEmails();
  await scheduleRenewalReminderEmails();
}

export async function markOnboardingActivity(userId: string) {
  await db
    .update(users)
    .set({ lastOnboardingActivityAt: new Date() })
    .where(eq(users.id, userId));
}

export async function markOnboardingComplete(userId: string) {
  await db
    .update(users)
    .set({
      onboardingCompletedAt: new Date(),
      lastOnboardingActivityAt: new Date(),
    })
    .where(eq(users.id, userId));

  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const [profile] = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1);
  if (user?.email && profile?.handle) {
    await enqueueSiteLiveEmail(userId, user.email, user.name || "there", profile.handle);
  }
}
