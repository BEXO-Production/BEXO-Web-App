import { and, eq, sql } from "drizzle-orm";
import { db, payments, profiles, subscriptions, users } from "@workspace/db";
import { enqueueEmail, processEmailOutbox } from "./emailOutbox";
import { invalidatePricingCache } from "./pricingCatalog";
import { appOrigin, portfolioPublicUrl } from "./platform";
import { logger } from "./logger";
import { invalidatePortfolioRenderCache } from "./portfolioRenderCache";

export const PREMIUM_TEMPLATE_IDS = ["cura-futuri", "sierra-montana", "nico-palmer"] as const;
export const PREMIUM_TRIAL_DAYS = 30;

export function premiumTrialExpiry(from: Date = new Date()): Date {
  const d = new Date(from.getTime());
  d.setDate(d.getDate() + PREMIUM_TRIAL_DAYS);
  return d;
}

export function formatTrialExpiryLabel(expiresAt: Date): string {
  return expiresAt.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });
}

export function pickRandomPremiumTemplate(exclude?: string | null): string {
  const pool = PREMIUM_TEMPLATE_IDS.filter((t) => t !== exclude);
  const list = pool.length ? pool : [...PREMIUM_TEMPLATE_IDS];
  return list[Math.floor(Math.random() * list.length)]!;
}

/** After admin grant / paid activation — ensure premium template + live subdomain site. */
export async function upgradeUserToPremiumLive(
  userId: string,
  opts?: { preferKeepTemplate?: boolean; forceRandomTemplate?: boolean },
): Promise<{ templateId: string; handle: string | null; subdomainUrl: string | null }> {
  const [user] = await db
    .select({ templateId: users.templateId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const [profile] = await db
    .select({ handle: profiles.handle, templateId: profiles.templateId })
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1);

  const current = user?.templateId || profile?.templateId || "minimal";
  const alreadyPremium = PREMIUM_TEMPLATE_IDS.includes(
    current as (typeof PREMIUM_TEMPLATE_IDS)[number],
  );
  const keep =
    !opts?.forceRandomTemplate &&
    opts?.preferKeepTemplate !== false &&
    alreadyPremium;
  const templateId = keep ? current : pickRandomPremiumTemplate(current);

  await db
    .update(users)
    .set({
      templateId,
      siteStatus: "live",
      pauseReason: null,
      cancelAtPeriodEnd: false,
      graceUntil: null,
      paymentFailedAt: null,
    })
    .where(eq(users.id, userId));

  await db
    .update(profiles)
    .set({ isPremium: true, templateId })
    .where(eq(profiles.userId, userId));

  const handle = profile?.handle ? String(profile.handle).toLowerCase().trim() : null;
  if (handle) {
    invalidatePortfolioRenderCache(handle);
  }

  return {
    templateId,
    handle,
    subdomainUrl: handle ? portfolioPublicUrl(handle) : null,
  };
}

/** After admin starts a 30-day premium trial — email user + mark cancel-at-period-end. */
export async function finalizePremiumTrial(opts: {
  userId: string;
  plan: string;
  planLabel?: string;
  expiresAt: Date;
  siteUrl?: string | null;
}): Promise<{ emailed: boolean; email: string | null; error?: string }> {
  const [user] = await db
    .select({ email: users.email, name: users.name })
    .from(users)
    .where(eq(users.id, opts.userId))
    .limit(1);

  const email = user?.email ? String(user.email).trim().toLowerCase() : "";
  if (!email) {
    return {
      emailed: false,
      email: null,
      error: "User has no email on file — add an email before starting a trial so they get Autopay instructions.",
    };
  }

  // Trial ends unless Autopay is set up (user must convert before expiry).
  await db
    .update(users)
    .set({ cancelAtPeriodEnd: true })
    .where(eq(users.id, opts.userId));

  const origin = appOrigin();
  const planLabel = opts.planLabel || opts.plan;
  const expiresLabel = formatTrialExpiryLabel(opts.expiresAt);
  const expiresDay = opts.expiresAt.toISOString().slice(0, 10);

  const queued = await enqueueEmail({
    eventType: "premium_trial_started",
    recipient: email,
    subject: `Your BEXO ${planLabel} free trial has started — set up Autopay`,
    dedupeKey: `premium_trial_started:${opts.userId}:${expiresDay}`,
    userId: opts.userId,
    relatedId: opts.plan,
    payload: {
      userName: user?.name || "there",
      plan: opts.plan,
      planLabel,
      expiresLabel,
      billingUrl: `${origin}/billing`,
      siteUrl: opts.siteUrl || "",
      trialDays: PREMIUM_TRIAL_DAYS,
    },
  });

  // Flush quickly so staff see delivery status soon after grant.
  await processEmailOutbox(5).catch((err) =>
    logger.warn({ err, userId: opts.userId }, "Trial email outbox flush failed"),
  );

  logger.info(
    { userId: opts.userId, email, plan: opts.plan, expiresAt: opts.expiresAt.toISOString(), queued: !!queued },
    "Premium trial notification processed",
  );

  return { emailed: !!queued, email };
}

export async function notifyPlanPriceChange(opts: {
  planId: string;
  planLabel: string;
  oldPriceInr: number;
  newPriceInr: number;
}): Promise<{ emailed: number }> {
  invalidatePricingCache();
  if (opts.oldPriceInr === opts.newPriceInr) return { emailed: 0 };

  const rows = await db
    .select({
      userId: subscriptions.userId,
      email: users.email,
      name: users.name,
      expiresAt: subscriptions.expiresAt,
    })
    .from(subscriptions)
    .innerJoin(users, eq(users.id, subscriptions.userId))
    .where(and(eq(subscriptions.plan, opts.planId), eq(subscriptions.status, "active")));

  const origin = appOrigin();
  let emailed = 0;
  for (const row of rows) {
    if (!row.email) continue;
    const effectiveLabel = row.expiresAt
      ? new Date(row.expiresAt).toLocaleDateString("en-IN", {
          day: "numeric",
          month: "short",
          year: "numeric",
        })
      : "";
    const queued = await enqueueEmail({
      eventType: "plan_price_change",
      recipient: row.email,
      subject: `${opts.planLabel}: price update from next cycle`,
      dedupeKey: `plan_price_change:${opts.planId}:${opts.newPriceInr}:${row.userId}:${Math.floor(Date.now() / 86_400_000)}`,
      userId: row.userId,
      relatedId: opts.planId,
      payload: {
        userName: row.name || "there",
        plan: opts.planId,
        planLabel: opts.planLabel,
        oldPriceInr: opts.oldPriceInr,
        newPriceInr: opts.newPriceInr,
        billingUrl: `${origin}/billing`,
        effectiveLabel,
      },
    });
    if (queued) emailed += 1;
  }
  logger.info(
    { planId: opts.planId, emailed, old: opts.oldPriceInr, next: opts.newPriceInr },
    "Plan price-change notifications queued",
  );
  return { emailed };
}

export function csvEscape(value: unknown): string {
  const s = value == null ? "" : String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(csvEscape).join(",")];
  for (const row of rows) lines.push(row.map(csvEscape).join(","));
  return `\uFEFF${lines.join("\n")}`;
}

export async function countSuccessfulPaymentsForUser(userId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(payments)
    .where(and(eq(payments.userId, userId), eq(payments.status, "success")));
  return Number(row?.n || 0);
}
