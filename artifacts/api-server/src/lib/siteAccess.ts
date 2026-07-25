import { createHash } from "crypto";
import { db, users } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  FREE_STORAGE_BYTES,
  recomputeUserQuota,
  resolveSubscriptionState,
  type PlanId,
  type SubscriptionState,
} from "./subscriptions";

export const PAYMENT_GRACE_DAYS = 15;
export const PAYMENT_GRACE_MS = PAYMENT_GRACE_DAYS * 24 * 60 * 60 * 1000;

export type SiteStatus = "live" | "paused" | "grace";
export type PauseReason =
  | "payment_failed"
  | "storage_exceeded"
  | "subscription_ended"
  | "manual"
  | null;

export type SiteAccess = {
  siteStatus: SiteStatus;
  pauseReason: PauseReason;
  graceUntil: Date | null;
  cancelAtPeriodEnd: boolean;
  paymentFailedAt: Date | null;
  /** True when visitors should see the pause banner (not the portfolio). */
  isPausedForVisitors: boolean;
  /** True when portfolio still serves during payment grace. */
  isInPaymentGrace: boolean;
  subscription: SubscriptionState;
  storageUsedBytes: number;
  overStorage: boolean;
};

const PAUSE_COPY: Record<Exclude<PauseReason, null>, { title: string; body: string }> = {
  payment_failed: {
    title: "This portfolio is paused",
    body: "Auto-renew payment failed and the grace period has ended. The owner needs to update billing to bring this site back online.",
  },
  storage_exceeded: {
    title: "This portfolio is paused",
    body: "This workspace has exceeded its storage limit. The owner needs to free space or add storage to remount the site.",
  },
  subscription_ended: {
    title: "This portfolio is paused",
    body: "The paid subscription for this portfolio has ended. The owner can renew from Billing to restore the live site.",
  },
  manual: {
    title: "This portfolio is paused",
    body: "This portfolio has been temporarily paused by the owner or BEXO support.",
  },
};

export function pauseBannerCopy(reason: PauseReason) {
  if (!reason) {
    return {
      title: "This portfolio is paused",
      body: "This portfolio is temporarily unavailable. The owner can restore it from the BEXO dashboard.",
    };
  }
  return PAUSE_COPY[reason];
}

export function buildPausedPortfolioHtml(opts: {
  handle: string;
  reason: PauseReason;
  ownerName?: string | null;
}): string {
  const copy = pauseBannerCopy(opts.reason);
  const safeHandle = String(opts.handle || "portfolio").replace(/[<>&"]/g, "");
  const reasonLabel =
    opts.reason === "payment_failed"
      ? "Billing / autopay issue"
      : opts.reason === "storage_exceeded"
        ? "Storage limit exceeded"
        : opts.reason === "subscription_ended"
          ? "Subscription ended"
          : "Temporarily paused";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex,nofollow" />
  <title>Portfolio paused — ${safeHandle}</title>
  <style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    body {
      margin: 0; min-height: 100dvh; display: grid; place-items: center;
      font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
      background: #f8fafc; color: #0f172a;
      padding: 1.5rem;
    }
    .card {
      width: min(34rem, 100%);
      background: #fff; border: 1px solid #e2e8f0; border-radius: 1.25rem;
      padding: 2rem 1.75rem; box-shadow: 0 18px 40px rgba(15,23,42,.06);
    }
    .badge {
      display: inline-flex; align-items: center; gap: .4rem;
      font-size: .7rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase;
      color: #b45309; background: #fffbeb; border: 1px solid #fde68a;
      border-radius: 999px; padding: .35rem .7rem; margin-bottom: 1rem;
    }
    h1 { font-size: 1.45rem; line-height: 1.25; margin: 0 0 .75rem; }
    p { margin: 0; color: #475569; line-height: 1.55; font-size: .95rem; }
    .meta { margin-top: 1.25rem; font-size: .8rem; color: #94a3b8; }
    .cta {
      display: inline-block; margin-top: 1.5rem; text-decoration: none;
      background: #4f46e5; color: #fff; font-weight: 600; font-size: .875rem;
      padding: .7rem 1rem; border-radius: .75rem;
    }
  </style>
</head>
<body>
  <main class="card">
    <div class="badge">${reasonLabel}</div>
    <h1>${copy.title}</h1>
    <p>${copy.body}</p>
    <p class="meta">Handle: ${safeHandle}${opts.ownerName ? ` · ${String(opts.ownerName).replace(/[<>&"]/g, "")}` : ""}</p>
    <a class="cta" href="${process.env.FRONTEND_URL || process.env.WEB_URL || "https://dash.mybexo.com"}/billing">Owner: fix in Dashboard → Billing</a>
  </main>
</body>
</html>`;
}

/**
 * Reconcile storage/payment site flags and return the access snapshot used by
 * public render + billing/dashboard.
 */
export async function resolveSiteAccess(userId: string): Promise<SiteAccess> {
  const subscription = await resolveSubscriptionState(userId);
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) {
    return {
      siteStatus: "paused",
      pauseReason: "manual",
      graceUntil: null,
      cancelAtPeriodEnd: false,
      paymentFailedAt: null,
      isPausedForVisitors: true,
      isInPaymentGrace: false,
      subscription,
      storageUsedBytes: 0,
      overStorage: false,
    };
  }

  const used = Math.max(0, Number(user.storageUsedBytes) || 0);
  const quota = Math.max(FREE_STORAGE_BYTES, Number(subscription.storageQuotaBytes) || FREE_STORAGE_BYTES);
  const overStorage = used > quota;

  let siteStatus = (user.siteStatus as SiteStatus) || "live";
  let pauseReason = (user.pauseReason as PauseReason) || null;
  let graceUntil = user.graceUntil || null;
  const cancelAtPeriodEnd = !!user.cancelAtPeriodEnd;
  let paymentFailedAt = user.paymentFailedAt || null;

  const now = Date.now();
  const patch: Partial<typeof users.$inferInsert> = {};

  // Payment grace: still serve the portfolio until grace_until.
  if (siteStatus === "grace" && graceUntil && graceUntil.getTime() <= now) {
    siteStatus = "paused";
    pauseReason = pauseReason || "payment_failed";
    patch.siteStatus = "paused";
    patch.pauseReason = pauseReason;
  }

  // Storage over-quota always pauses public serve (even during payment grace).
  if (overStorage) {
    if (siteStatus !== "paused" || pauseReason !== "storage_exceeded") {
      // Prefer keeping payment_failed reason if already paused for billing,
      // but storage still blocks visitors either way.
      if (siteStatus !== "paused") {
        siteStatus = "paused";
        pauseReason = "storage_exceeded";
        patch.siteStatus = "paused";
        patch.pauseReason = "storage_exceeded";
      } else if (!pauseReason) {
        pauseReason = "storage_exceeded";
        patch.pauseReason = "storage_exceeded";
      }
    }
  } else if (pauseReason === "storage_exceeded" && siteStatus === "paused") {
    // Remount after storage cleared — restore to live unless payment grace/pause still applies.
    if (paymentFailedAt && graceUntil && graceUntil.getTime() > now) {
      siteStatus = "grace";
      pauseReason = "payment_failed";
      patch.siteStatus = "grace";
      patch.pauseReason = "payment_failed";
    } else if (paymentFailedAt && graceUntil && graceUntil.getTime() <= now) {
      siteStatus = "paused";
      pauseReason = "payment_failed";
      patch.siteStatus = "paused";
      patch.pauseReason = "payment_failed";
    } else {
      siteStatus = "live";
      pauseReason = null;
      patch.siteStatus = "live";
      patch.pauseReason = null;
    }
  }

  if (Object.keys(patch).length > 0) {
    await db.update(users).set(patch).where(eq(users.id, userId));
  }

  const isInPaymentGrace = siteStatus === "grace";
  // Visitors see pause only when status is paused (grace still serves live site).
  const isPausedForVisitors = siteStatus === "paused" || overStorage;

  return {
    siteStatus: overStorage && siteStatus !== "paused" ? "paused" : siteStatus,
    pauseReason: overStorage && !pauseReason ? "storage_exceeded" : pauseReason,
    graceUntil,
    cancelAtPeriodEnd,
    paymentFailedAt,
    isPausedForVisitors: isPausedForVisitors || overStorage,
    isInPaymentGrace,
    subscription,
    storageUsedBytes: used,
    overStorage,
  };
}

export async function enterPaymentGrace(userId: string): Promise<Date> {
  const graceUntil = new Date(Date.now() + PAYMENT_GRACE_MS);
  await db
    .update(users)
    .set({
      siteStatus: "grace",
      pauseReason: "payment_failed",
      graceUntil,
      paymentFailedAt: new Date(),
    })
    .where(eq(users.id, userId));
  return graceUntil;
}

export async function clearPaymentGrace(userId: string): Promise<void> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return;

  const used = Math.max(0, Number(user.storageUsedBytes) || 0);
  await recomputeUserQuota(userId);
  const [fresh] = await db
    .select({ storageQuotaBytes: users.storageQuotaBytes })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const quota = Math.max(FREE_STORAGE_BYTES, Number(fresh?.storageQuotaBytes) || FREE_STORAGE_BYTES);
  const overStorage = used > quota;

  await db
    .update(users)
    .set({
      paymentFailedAt: null,
      graceUntil: null,
      siteStatus: overStorage ? "paused" : "live",
      pauseReason: overStorage ? "storage_exceeded" : null,
    })
    .where(eq(users.id, userId));
}

export async function expireGraceWindows(limit = 200): Promise<number> {
  const now = new Date();
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.siteStatus, "grace"))
    .limit(limit);

  let changed = 0;
  for (const row of rows) {
    const access = await resolveSiteAccess(row.id);
    if (access.siteStatus === "paused" && access.pauseReason === "payment_failed") {
      changed += 1;
    } else if (access.graceUntil && access.graceUntil.getTime() <= now.getTime()) {
      await db
        .update(users)
        .set({ siteStatus: "paused", pauseReason: "payment_failed" })
        .where(eq(users.id, row.id));
      changed += 1;
    }
  }
  return changed;
}

export async function setCancelAtPeriodEnd(userId: string, value: boolean): Promise<void> {
  await db.update(users).set({ cancelAtPeriodEnd: value }).where(eq(users.id, userId));
}

/** Stable IP / UA hashing for analytics (no raw PII stored). */
export function hashAnalyticsToken(value: string, salt = process.env.ANALYTICS_HASH_SALT || "bexo"): string {
  return createHash("sha256").update(`${salt}:${value}`).digest("hex").slice(0, 32);
}

export function planHasAnalytics(plan: PlanId | null | undefined): boolean {
  return plan === "essential" || plan === "growth";
}
