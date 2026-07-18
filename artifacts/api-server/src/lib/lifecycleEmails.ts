import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import { db, users, profiles } from "@workspace/db";
import { enqueueEmail } from "./emailOutbox";
import { logger } from "./logger";

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
  const siteUrl = `https://${handle}.mybexo.com`;
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
 * Schedule recovery emails for users who started onboarding but have been
 * inactive for 24h+ and have not completed onboarding.
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
          resumeUrl: "https://mybexo.com/",
        },
      });
    }
  } catch (error) {
    logger.error({ error }, "Failed scheduling recovery emails");
  }
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
