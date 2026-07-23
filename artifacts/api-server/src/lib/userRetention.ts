/**
 * User retention rules:
 * - OTP not verified → never write a users row (auth only stores OTP in Redis ≤30m)
 * - Phone verified only (no Google/email) → provisional; auto-delete after 7 days
 * - Phone + email (Google link or verified email) → permanent; recovery emails allowed
 */
import { and, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import {
  addonSubscriptions,
  analyticsEvents,
  assets,
  activationKeys,
  billingLedger,
  billingProfiles,
  contactSubmissions,
  couponRedemptions,
  db,
  emailDeliveries,
  leadReplies,
  payments,
  portfolioStatsDaily,
  portfolioVisitBuckets,
  portfolios,
  profileSections,
  profiles,
  resumeParseAttempts,
  subscriptions,
  supportTickets,
  users,
} from "@workspace/db";
import { logger } from "./logger";

const DAY_MS = 24 * 60 * 60 * 1000;
export const PHONE_ONLY_RETENTION_DAYS = 7;
/** OTP codes live only in Redis — never longer than this. */
export const OTP_MAX_TTL_SECONDS = 30 * 60;

export function isEmailVerifiedUser(user: {
  email?: string | null;
  oauthProvider?: string | null;
  oauthId?: string | null;
}): boolean {
  const hasOauth = !!(user.oauthProvider && user.oauthId);
  const hasEmail = !!(user.email && String(user.email).trim());
  return hasOauth || hasEmail;
}

/** Permanent account: email/Google linked, finished onboarding, or paid. */
export function isPermanentlyRetained(user: {
  email?: string | null;
  oauthProvider?: string | null;
  oauthId?: string | null;
  name?: string | null;
  onboardingCompletedAt?: Date | null;
}): boolean {
  if (user.onboardingCompletedAt) return true;
  if (isEmailVerifiedUser(user)) return true;
  if (user.name && String(user.name).trim()) return true;
  return false;
}

async function deleteUserGraph(userIds: string[]) {
  if (!userIds.length) return 0;

  const profileRows = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(inArray(profiles.userId, userIds));
  const profileIds = profileRows.map((p) => p.id);

  if (profileIds.length) {
    await db.delete(portfolioStatsDaily).where(inArray(portfolioStatsDaily.profileId, profileIds));
    await db.delete(portfolioVisitBuckets).where(inArray(portfolioVisitBuckets.profileId, profileIds));
    await db.delete(profileSections).where(inArray(profileSections.profileId, profileIds));
  }

  // Contact → lead replies
  const contacts = await db
    .select({ id: contactSubmissions.id })
    .from(contactSubmissions)
    .where(inArray(contactSubmissions.userId, userIds));
  const contactIds = contacts.map((c) => c.id);
  if (contactIds.length) {
    await db.delete(leadReplies).where(inArray(leadReplies.contactSubmissionId, contactIds));
  }
  await db.delete(contactSubmissions).where(inArray(contactSubmissions.userId, userIds));

  await db.delete(supportTickets).where(inArray(supportTickets.userId, userIds));
  await db.delete(analyticsEvents).where(inArray(analyticsEvents.userId, userIds));
  await db.delete(resumeParseAttempts).where(inArray(resumeParseAttempts.userId, userIds));
  await db.delete(emailDeliveries).where(inArray(emailDeliveries.userId, userIds));
  await db.delete(couponRedemptions).where(inArray(couponRedemptions.userId, userIds));
  await db.delete(billingLedger).where(inArray(billingLedger.userId, userIds));
  await db.delete(billingProfiles).where(inArray(billingProfiles.userId, userIds));
  await db.delete(addonSubscriptions).where(inArray(addonSubscriptions.userId, userIds));
  await db.delete(payments).where(inArray(payments.userId, userIds));
  await db.delete(subscriptions).where(inArray(subscriptions.userId, userIds));
  await db.delete(assets).where(inArray(assets.userId, userIds));
  await db.delete(portfolios).where(inArray(portfolios.userId, userIds));
  await db.delete(profiles).where(inArray(profiles.userId, userIds));

  // Clear activation redeem pointers without deleting unused campus codes
  await db
    .update(activationKeys)
    .set({ redeemedBy: null })
    .where(inArray(activationKeys.redeemedBy, userIds));

  await db.delete(users).where(inArray(users.id, userIds));
  return userIds.length;
}

/**
 * Phone-only provisional accounts older than retention window.
 * Never deletes anyone with email/Google/name/onboarding complete or a successful payment.
 */
export async function purgeAbandonedPhoneOnlyUsers(opts?: {
  olderThanDays?: number;
  limit?: number;
  /** Include brand-new stubs immediately (one-time admin cleanup). */
  includeImmediate?: boolean;
}) {
  const days = opts?.olderThanDays ?? PHONE_ONLY_RETENTION_DAYS;
  const limit = Math.min(Math.max(opts?.limit ?? 200, 1), 500);
  const cutoff = new Date(Date.now() - days * DAY_MS);

  const provisional = and(
    isNull(users.oauthProvider),
    isNull(users.oauthId),
    or(isNull(users.email), sql`btrim(coalesce(${users.email}, '')) = ''`),
    or(isNull(users.name), sql`btrim(coalesce(${users.name}, '')) = ''`),
    isNull(users.onboardingCompletedAt),
  );

  const ageFilter = opts?.includeImmediate
    ? sql`true`
    : or(
        and(sql`${users.lastOnboardingActivityAt} IS NOT NULL`, lt(users.lastOnboardingActivityAt, cutoff)),
        and(sql`${users.lastOnboardingActivityAt} IS NULL`, lt(users.createdAt, cutoff)),
      );

  const candidates = await db
    .select({ id: users.id, phone: users.phone, createdAt: users.createdAt })
    .from(users)
    .where(and(provisional, ageFilter))
    .limit(limit);

  if (!candidates.length) {
    return { deleted: 0, ids: [] as string[] };
  }

  // Skip anyone with a successful / awaiting payment (safety)
  const ids = candidates.map((c) => c.id);
  const paid = await db
    .select({ userId: payments.userId })
    .from(payments)
    .where(
      and(
        inArray(payments.userId, ids),
        or(eq(payments.status, "success"), eq(payments.status, "awaiting_mandate")),
      ),
    );
  const paidSet = new Set(paid.map((p) => p.userId));
  const doomed = ids.filter((id) => !paidSet.has(id));

  if (!doomed.length) {
    return { deleted: 0, ids: [] as string[] };
  }

  try {
    const deleted = await deleteUserGraph(doomed);
    logger.info(
      { deleted, samplePhones: candidates.filter((c) => doomed.includes(c.id)).map((c) => c.phone).slice(0, 10) },
      "Purged abandoned phone-only users",
    );
    return { deleted, ids: doomed };
  } catch (error) {
    logger.error({ error, doomedCount: doomed.length }, "Failed purging phone-only users");
    throw error;
  }
}

/** One-time: purge current stubs + obvious test phones (90000…). */
export async function purgeIncompleteAndTestUsersOnce() {
  const stubs = await purgeAbandonedPhoneOnlyUsers({ includeImmediate: true, limit: 500 });

  const testRows = await db
    .select({ id: users.id, phone: users.phone })
    .from(users)
    .where(
      and(
        sql`${users.phone} LIKE '9190000%'`,
        isNull(users.onboardingCompletedAt),
      ),
    )
    .limit(200);

  const already = new Set(stubs.ids);
  const extra = testRows.map((r) => r.id).filter((id) => !already.has(id));
  let testDeleted = 0;
  if (extra.length) {
    testDeleted = await deleteUserGraph(extra);
  }

  return {
    stubsDeleted: stubs.deleted,
    testDeleted,
    total: stubs.deleted + testDeleted,
    ids: [...stubs.ids, ...extra],
  };
}
