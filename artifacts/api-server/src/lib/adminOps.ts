import { and, eq, sql } from "drizzle-orm";
import { db, payments, profiles, subscriptions, users } from "@workspace/db";
import { enqueueEmail } from "./emailOutbox";
import { invalidatePricingCache } from "./pricingCatalog";
import { appOrigin, portfolioPublicUrl } from "./platform";
import { logger } from "./logger";
import { invalidatePortfolioRenderCache } from "./portfolioRenderCache";

export const PREMIUM_TEMPLATE_IDS = ["cura-futuri", "sierra-montana", "nico-palmer"] as const;

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
