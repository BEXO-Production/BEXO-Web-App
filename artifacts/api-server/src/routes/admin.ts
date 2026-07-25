import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { Router, type IRouter, type Response } from "express";
import jwt from "jsonwebtoken";
import { and, count, desc, eq, ilike, or, gte, sql } from "drizzle-orm";
import {
  adminAuditLog,
  billingLedger,
  billingProfiles,
  contactSubmissions,
  db,
  payments,
  portfolioStatsDaily,
  pricingCoupons,
  pricingPlans,
  profiles,
  staffInvites,
  staffUsers,
  subscriptions,
  supportNotes,
  templates,
  users,
} from "@workspace/db";
import { staffGuard, type StaffRequest, type StaffRole } from "../middlewares/staffAuth";
import {
  activatePaidPlan,
  FREE_STORAGE_BYTES,
  isPaidPlan,
  planTermEnd,
  recomputeUserQuota,
  resolveSubscriptionState,
  type PaidPlan,
} from "../lib/subscriptions";
import { portfolioPublicUrl, pathPortfolioUrl } from "../lib/platform";
import {
  invalidatePricingCache,
  loadPricingCatalog,
} from "../lib/pricingCatalog";
import {
  finalizePremiumTrial,
  notifyPlanPriceChange,
  premiumTrialExpiry,
  PREMIUM_TRIAL_DAYS,
  toCsv,
  upgradeUserToPremiumLive,
} from "../lib/adminOps";
import { generateAndStoreInvoice } from "../lib/invoiceStore";
import { logger } from "../lib/logger";
import { issueStaffInvite } from "../lib/staffInvite";
import Razorpay from "razorpay";
import { registerAdminExtras } from "./adminExtras";
import { registerAdminSupport } from "./adminSupport";
import { registerAdminMarketingLeads } from "./marketing";
import { registerAdminActivation } from "./adminActivation";

const router: IRouter = Router();

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const next = scryptSync(password, salt, 64);
  const prev = Buffer.from(hash, "hex");
  if (prev.length !== next.length) return false;
  return timingSafeEqual(prev, next);
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function audit(
  req: StaffRequest,
  action: string,
  targetType?: string,
  targetId?: string,
  meta: Record<string, unknown> = {},
) {
  await db.insert(adminAuditLog).values({
    actorStaffId: req.staff?.id,
    action,
    targetType: targetType || null,
    targetId: targetId || null,
    meta,
    ip: req.ip || null,
  });
}

function signStaffToken(staff: { id: string; role: string }) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET missing");
  return jwt.sign({ id: staff.id, staff: true, role: staff.role }, secret, {
    expiresIn: "12h",
  });
}

function defaultGrantExpiry(plan: PaidPlan, explicit?: string | null): Date | null {
  if (explicit) {
    const d = new Date(explicit);
    if (!Number.isNaN(d.getTime())) return plan === "studentplus" ? null : d;
  }
  return planTermEnd(plan, new Date());
}

function publicUrlsForHandle(handle: string | null | undefined, isPremium: boolean) {
  if (!handle) return { pathUrl: null as string | null, subdomainUrl: null as string | null };
  const pathUrl = pathPortfolioUrl(handle);
  const subdomainUrl = portfolioPublicUrl(handle);
  return {
    pathUrl,
    subdomainUrl,
    recommendedUrl: isPremium ? subdomainUrl : pathUrl,
  };
}

// ——— Auth ———

router.post("/auth/login", async (req, res: Response) => {
  try {
    const email = String(req.body?.email || "")
      .toLowerCase()
      .trim();
    const password = String(req.body?.password || "");
    if (!email || !password) {
      res.status(400).json({ error: "Email and password required" });
      return;
    }

    const [staff] = await db
      .select()
      .from(staffUsers)
      .where(eq(staffUsers.email, email))
      .limit(1);

    if (!staff || !staff.isActive) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    // First login bootstrap: null passwordHash — never persist shared bootstrap as permanent hash.
    let mustChangePassword = !!staff.mustChangePassword;
    if (!staff.passwordHash) {
      const isProd = process.env.NODE_ENV === "production";
      const bootstrapAllowed = process.env.ALLOW_STAFF_BOOTSTRAP === "1";
      if (isProd && !bootstrapAllowed) {
        logger.warn(
          { email, staffId: staff.id },
          "Staff login refused: passwordHash null in production (set ALLOW_STAFF_BOOTSTRAP=1 only for emergency bootstrap)",
        );
        res.status(401).json({
          error:
            "Password not set. Accept an invite to set your password, or contact a super_admin.",
        });
        return;
      }

      const bootstrap = process.env.STAFF_BOOTSTRAP_PASSWORD || "";
      if (!bootstrap || password !== bootstrap) {
        res.status(401).json({
          error: "Password not set. Use bootstrap password once, or accept an invite.",
        });
        return;
      }

      // Temporary session only — force password change via POST /me/password (hash stays null).
      mustChangePassword = true;
      await db
        .update(staffUsers)
        .set({ lastLoginAt: new Date(), updatedAt: new Date(), mustChangePassword: true })
        .where(eq(staffUsers.id, staff.id));
    } else if (!verifyPassword(password, staff.passwordHash)) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    } else {
      await db
        .update(staffUsers)
        .set({ lastLoginAt: new Date(), updatedAt: new Date() })
        .where(eq(staffUsers.id, staff.id));
    }

    const token = signStaffToken(staff);
    res.json({
      token,
      mustChangePassword,
      staff: {
        id: staff.id,
        email: staff.email,
        name: staff.name,
        phone: staff.phone,
        role: staff.role,
        mustChangePassword,
      },
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post("/auth/accept-invite", async (req, res: Response) => {
  try {
    const token = String(req.body?.token || "");
    const password = String(req.body?.password || "");
    const name = String(req.body?.name || "").trim() || null;
    const phone = String(req.body?.phone || "").trim() || null;
    if (!token || password.length < 8) {
      res.status(400).json({ error: "Token and password (8+ chars) required" });
      return;
    }

    const tokenHash = hashToken(token);

    // Peek invite email (non-claiming) so we can reject active staff before burning the token.
    const [peek] = await db
      .select()
      .from(staffInvites)
      .where(eq(staffInvites.tokenHash, tokenHash))
      .limit(1);

    if (!peek || peek.acceptedAt || peek.expiresAt < new Date()) {
      res.status(400).json({ error: "Invite invalid or expired" });
      return;
    }

    const email = peek.email.toLowerCase();
    let [existing] = await db
      .select()
      .from(staffUsers)
      .where(eq(staffUsers.email, email))
      .limit(1);

    // Pre-provisioned accounts (auto password emailed) may already be active —
    // accepting the invite confirms onboarding and optionally sets a new password.
    // Only block if there is NO open invite claim path (handled by atomic update below).

    // Atomic claim — only one acceptor wins; already-used / expired → no row.
    const [invite] = await db
      .update(staffInvites)
      .set({ acceptedAt: new Date() })
      .where(
        and(
          eq(staffInvites.tokenHash, tokenHash),
          sql`${staffInvites.acceptedAt} is null`,
          sql`${staffInvites.expiresAt} > now()`,
        ),
      )
      .returning();

    if (!invite) {
      res.status(400).json({ error: "Invite invalid, expired, or already used" });
      return;
    }

    const passwordHash = hashPassword(password);
    const finalName = name || invite.name || null;
    const finalPhone = phone || invite.phone || null;

    const [linkedUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    let staff = existing;
    if (staff) {
      // Existing account (often pre-created with temporary password): confirm + set chosen password.
      const [updated] = await db
        .update(staffUsers)
        .set({
          passwordHash,
          role: invite.role,
          name: finalName || staff.name,
          phone: finalPhone || staff.phone,
          linkedUserId: linkedUser?.id || staff.linkedUserId,
          isActive: true,
          mustChangePassword: false,
          passwordResetTokenHash: null,
          passwordResetExpiresAt: null,
          updatedAt: new Date(),
          lastLoginAt: new Date(),
        })
        .where(eq(staffUsers.id, staff.id))
        .returning();
      staff = updated;
    } else {
      const [created] = await db
        .insert(staffUsers)
        .values({
          email,
          name: finalName,
          phone: finalPhone,
          passwordHash,
          role: invite.role,
          invitedBy: invite.invitedBy,
          linkedUserId: linkedUser?.id || null,
          isActive: true,
          mustChangePassword: false,
          lastLoginAt: new Date(),
        })
        .returning();
      staff = created;
    }

    const access = signStaffToken(staff!);
    res.json({
      token: access,
      mustChangePassword: false,
      staff: {
        id: staff!.id,
        email: staff!.email,
        name: staff!.name,
        phone: staff!.phone,
        role: staff!.role,
        mustChangePassword: false,
      },
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get("/me", staffGuard(), async (req: StaffRequest, res: Response) => {
  try {
    const [row] = await db
      .select({
        id: staffUsers.id,
        email: staffUsers.email,
        name: staffUsers.name,
        phone: staffUsers.phone,
        role: staffUsers.role,
        linkedUserId: staffUsers.linkedUserId,
        mustChangePassword: staffUsers.mustChangePassword,
      })
      .from(staffUsers)
      .where(eq(staffUsers.id, req.staff!.id))
      .limit(1);
    res.json({
      staff: row
        ? { ...row, mustChangePassword: !!row.mustChangePassword }
        : { ...req.staff, mustChangePassword: false },
      mustChangePassword: !!row?.mustChangePassword,
    });
  } catch {
    res.json({ staff: req.staff, mustChangePassword: false });
  }
});

// ——— Overview / analytics ———

router.get(
  "/analytics/overview",
  staffGuard(["super_admin", "ops", "billing"]),
  async (_req: StaffRequest, res: Response) => {
    try {
      const since7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      const [
        [{ userCount }],
        [{ activeSubs }],
        [{ payments30 }],
        [{ liveSites }],
        [{ pausedSites }],
        [{ graceSites }],
        [{ leads30 }],
        [{ signups7 }],
        [{ signups30 }],
      ] = await Promise.all([
        db.select({ userCount: count() }).from(users),
        db
          .select({ activeSubs: count() })
          .from(subscriptions)
          .where(eq(subscriptions.status, "active")),
        db
          .select({ payments30: count() })
          .from(payments)
          .where(and(eq(payments.status, "success"), gte(payments.createdAt, since30))),
        db.select({ liveSites: count() }).from(users).where(eq(users.siteStatus, "live")),
        db.select({ pausedSites: count() }).from(users).where(eq(users.siteStatus, "paused")),
        db.select({ graceSites: count() }).from(users).where(eq(users.siteStatus, "grace")),
        db
          .select({ leads30: count() })
          .from(contactSubmissions)
          .where(gte(contactSubmissions.createdAt, since30)),
        db.select({ signups7: count() }).from(users).where(gte(users.createdAt, since7)),
        db.select({ signups30: count() }).from(users).where(gte(users.createdAt, since30)),
      ]);

      const [
        paidRows,
        [{ failedPayments30 }],
        [{ paymentFailedUsers }],
        [{ cancelPending }],
        planMix,
        signupSeries,
        revenueSeriesRaw,
      ] = await Promise.all([
        db
          .select({ amount: payments.amount })
          .from(payments)
          .where(and(eq(payments.status, "success"), gte(payments.createdAt, since30)))
          .limit(5000),
        db
          .select({ failedPayments30: count() })
          .from(payments)
          .where(
            and(
              gte(payments.createdAt, since30),
              sql`${payments.status} in ('failed','refunded','cancelled')`,
            ),
          ),
        db
          .select({ paymentFailedUsers: count() })
          .from(users)
          .where(sql`${users.paymentFailedAt} is not null`),
        db
          .select({ cancelPending: count() })
          .from(users)
          .where(eq(users.cancelAtPeriodEnd, true)),
        db
          .select({
            plan: subscriptions.plan,
            status: subscriptions.status,
            count: count(),
          })
          .from(subscriptions)
          .groupBy(subscriptions.plan, subscriptions.status),
        db
          .select({
            day: sql<string>`to_char(date_trunc('day', ${users.createdAt}), 'YYYY-MM-DD')`,
            count: count(),
          })
          .from(users)
          .where(gte(users.createdAt, since30))
          .groupBy(sql`date_trunc('day', ${users.createdAt})`)
          .orderBy(sql`date_trunc('day', ${users.createdAt})`),
        db
          .select({
            day: sql<string>`to_char(date_trunc('day', ${payments.createdAt}), 'YYYY-MM-DD')`,
            amountPaise: sql<number>`coalesce(sum(${payments.amount}),0)::int`,
            payments: count(),
          })
          .from(payments)
          .where(and(eq(payments.status, "success"), gte(payments.createdAt, since30)))
          .groupBy(sql`date_trunc('day', ${payments.createdAt})`)
          .orderBy(sql`date_trunc('day', ${payments.createdAt})`),
      ]);

      const revenuePaise30 = paidRows.reduce((s, r) => s + (r.amount || 0), 0);
      const freeUsers = Math.max(0, Number(userCount) - Number(activeSubs));
      const successPayments30 = paidRows.length;
      const paymentSuccessRate =
        successPayments30 + Number(failedPayments30) > 0
          ? successPayments30 / (successPayments30 + Number(failedPayments30))
          : 1;

      res.json({
        users: userCount,
        activeSubscriptions: activeSubs,
        freeUsers,
        liveSites,
        pausedSites,
        graceSites,
        paymentsLast30d: payments30,
        leadsLast30d: leads30,
        revenueInrLast30d: Math.round(revenuePaise30 / 100),
        signupsLast7d: signups7,
        signupsLast30d: signups30,
        planMix,
        signupSeries,
        revenueSeries: revenueSeriesRaw.map((r) => ({
          day: r.day,
          amountInr: Math.round(Number(r.amountPaise || 0) / 100),
          payments: Number(r.payments || 0),
        })),
        failedPayments30: Number(failedPayments30),
        paymentFailedUsers: Number(paymentFailedUsers),
        cancelPending: Number(cancelPending),
        paymentSuccessRate: Math.round(paymentSuccessRate * 1000) / 1000,
      });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  },
);

// ——— Users / portfolios ———

router.get(
  "/users",
  staffGuard(["super_admin", "support", "ops", "billing"]),
  async (req: StaffRequest, res: Response) => {
    try {
      const q = String(req.query.q || "").trim();
      const planFilter = String(req.query.plan || "").trim().toLowerCase();
      const statusFilter = String(req.query.status || "").trim().toLowerCase();
      const limit = Math.min(Number(req.query.limit) || 60, 200);
      const offset = Math.max(0, Number(req.query.offset) || 0);

      const conditions = [];
      if (q) {
        conditions.push(
          or(
            ilike(users.email, `%${q}%`),
            ilike(users.phone, `%${q}%`),
            ilike(users.name, `%${q}%`),
            ilike(profiles.handle, `%${q}%`),
          ),
        );
      }
      if (statusFilter) {
        conditions.push(eq(users.siteStatus, statusFilter));
      }
      if (planFilter === "free") {
        conditions.push(
          or(eq(subscriptions.status, "expired"), sql`${subscriptions.id} is null`, eq(subscriptions.plan, "free")),
        );
      } else if (planFilter) {
        conditions.push(and(eq(subscriptions.plan, planFilter), eq(subscriptions.status, "active")));
      }

      const whereClause =
        conditions.length === 0
          ? undefined
          : conditions.length === 1
            ? conditions[0]
            : and(...conditions);

      const [{ total }] = await db
        .select({ total: count() })
        .from(users)
        .leftJoin(profiles, eq(profiles.userId, users.id))
        .leftJoin(subscriptions, eq(subscriptions.userId, users.id))
        .where(whereClause);

      const rows = await db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          phone: users.phone,
          siteStatus: users.siteStatus,
          pauseReason: users.pauseReason,
          templateId: users.templateId,
          storageUsedBytes: users.storageUsedBytes,
          storageQuotaBytes: users.storageQuotaBytes,
          onboardingCompletedAt: users.onboardingCompletedAt,
          createdAt: users.createdAt,
          handle: profiles.handle,
          headline: profiles.headline,
          isPremium: profiles.isPremium,
          plan: subscriptions.plan,
          subscriptionStatus: subscriptions.status,
          expiresAt: subscriptions.expiresAt,
        })
        .from(users)
        .leftJoin(profiles, eq(profiles.userId, users.id))
        .leftJoin(subscriptions, eq(subscriptions.userId, users.id))
        .where(whereClause)
        .orderBy(desc(users.createdAt))
        .limit(limit)
        .offset(offset);

      res.json({
        total: Number(total),
        limit,
        offset,
        users: rows.map((r) => ({
          ...r,
          storagePct:
            r.storageQuotaBytes && r.storageQuotaBytes > 0
              ? Math.min(100, Math.round(((r.storageUsedBytes || 0) / r.storageQuotaBytes) * 100))
              : 0,
          onboardingComplete: !!r.onboardingCompletedAt,
        })),
      });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  },
);

router.get(
  "/users/:userId",
  staffGuard(["super_admin", "support", "ops", "billing"]),
  async (req: StaffRequest, res: Response) => {
    try {
      const userId = String(req.params.userId);
      const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }
      const [profile] = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1);
      const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1);
      const [billing] = await db
        .select()
        .from(billingProfiles)
        .where(eq(billingProfiles.userId, userId))
        .limit(1);
      const subscriptionState = await resolveSubscriptionState(userId);
      const recentPayments = await db
        .select()
        .from(payments)
        .where(eq(payments.userId, userId))
        .orderBy(desc(payments.createdAt))
        .limit(20);
      const notes = await db
        .select()
        .from(supportNotes)
        .where(and(eq(supportNotes.targetType, "user"), eq(supportNotes.targetId, userId)))
        .orderBy(desc(supportNotes.createdAt))
        .limit(50);

      const [{ leadsCount }] = await db
        .select({ leadsCount: count() })
        .from(contactSubmissions)
        .where(eq(contactSubmissions.userId, userId));
      const recentLeads = await db
        .select()
        .from(contactSubmissions)
        .where(eq(contactSubmissions.userId, userId))
        .orderBy(desc(contactSubmissions.createdAt))
        .limit(10);

      let visitStats: { day: string; views: number; uniquesApprox: number; leads: number }[] = [];
      if (profile?.id) {
        const stats = await db
          .select({
            day: portfolioStatsDaily.day,
            views: portfolioStatsDaily.views,
            uniquesApprox: portfolioStatsDaily.uniquesApprox,
            leads: portfolioStatsDaily.leads,
          })
          .from(portfolioStatsDaily)
          .where(eq(portfolioStatsDaily.profileId, profile.id))
          .orderBy(desc(portfolioStatsDaily.day))
          .limit(30);
        visitStats = stats.map((s) => ({
          day: String(s.day),
          views: s.views,
          uniquesApprox: s.uniquesApprox,
          leads: s.leads,
        }));
      }

      const urls = publicUrlsForHandle(profile?.handle, subscriptionState.isPremium);

      res.json({
        user,
        profile: profile || null,
        subscription: sub || null,
        subscriptionState: {
          plan: subscriptionState.plan,
          status: subscriptionState.status,
          isPremium: subscriptionState.isPremium,
          expiresAt: subscriptionState.expiresAt,
          billingPeriod: subscriptionState.billingPeriod,
          storageQuotaBytes: subscriptionState.storageQuotaBytes,
          storageBonusBytes: subscriptionState.storageBonusBytes,
          addonBlocks: subscriptionState.addonBlocks,
        },
        billingProfile: billing || null,
        payments: recentPayments,
        notes,
        leadsCount,
        recentLeads,
        visitStats,
        urls,
        storage: {
          usedBytes: user.storageUsedBytes || 0,
          quotaBytes: user.storageQuotaBytes || FREE_STORAGE_BYTES,
          pct:
            user.storageQuotaBytes && user.storageQuotaBytes > 0
              ? Math.min(100, Math.round(((user.storageUsedBytes || 0) / user.storageQuotaBytes) * 100))
              : 0,
        },
      });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  },
);

router.post(
  "/users/:userId/grant-plan",
  staffGuard(["super_admin", "billing"]),
  async (req: StaffRequest, res: Response) => {
    try {
      const userId = String(req.params.userId);
      const planRaw = String(req.body?.plan || "").toLowerCase();
      const isTrial = !!req.body?.trial || String(req.body?.mode || "").toLowerCase() === "trial";
      const reason =
        String(req.body?.reason || "").trim() ||
        (isTrial ? "premium_free_trial_30d" : "admin_grant");
      if (!isPaidPlan(planRaw)) {
        res.status(400).json({
          error: "Invalid plan. Use identity | essential | growth | studentplus",
        });
        return;
      }

      const [user] = await db
        .select({ id: users.id, email: users.email, name: users.name })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      if (isTrial && !user.email) {
        res.status(400).json({
          error:
            "User has no email on file. Add an email first — the trial Autopay instructions must be delivered by email.",
        });
        return;
      }

      // Trials are always exactly 30 days (even for studentplus / lifetime catalog plans).
      const expiresAt = isTrial
        ? premiumTrialExpiry()
        : defaultGrantExpiry(planRaw, req.body?.expiresAt);

      if (isTrial && (!expiresAt || expiresAt.getTime() <= Date.now())) {
        res.status(500).json({ error: "Failed to compute trial expiry" });
        return;
      }

      const result = await activatePaidPlan(userId, planRaw, expiresAt);

      // Foolproof: lifetime plans (studentplus) normally clear expiresAt — trials must keep the 30-day clock.
      if (isTrial && expiresAt) {
        await db
          .update(subscriptions)
          .set({ expiresAt, status: "active", plan: planRaw })
          .where(eq(subscriptions.userId, userId));
        result.expiresAt = expiresAt;
      }

      const upgraded = await upgradeUserToPremiumLive(userId, {
        preferKeepTemplate: true,
        forceRandomTemplate: false,
      });

      let trialMail: { emailed: boolean; email: string | null; error?: string } | null = null;
      if (isTrial && result.expiresAt) {
        trialMail = await finalizePremiumTrial({
          userId,
          plan: result.plan,
          planLabel: result.plan,
          expiresAt: result.expiresAt,
          siteUrl: upgraded.subdomainUrl,
        });
        if (trialMail.error && !trialMail.emailed) {
          // Plan is live but email failed validation — surface clearly; staff can fix email & re-send via re-grant.
          logger.warn({ userId, err: trialMail.error }, "Trial activated without email");
        }
      }

      await audit(req, isTrial ? "user.premium_trial" : "user.grant_plan", "user", userId, {
        plan: result.plan,
        expiresAt: result.expiresAt,
        reason,
        trial: isTrial,
        trialDays: isTrial ? PREMIUM_TRIAL_DAYS : undefined,
        renewalMode: result.renewalMode,
        templateId: upgraded.templateId,
        handle: upgraded.handle,
        subdomainUrl: upgraded.subdomainUrl,
        trialEmailQueued: trialMail?.emailed ?? false,
        trialEmailTo: trialMail?.email ?? null,
      });

      const subscriptionState = await resolveSubscriptionState(userId);
      const host = upgraded.subdomainUrl?.replace(/^https?:\/\//, "") || null;
      res.json({
        ok: true,
        trial: isTrial,
        trialDays: isTrial ? PREMIUM_TRIAL_DAYS : null,
        result,
        templateId: upgraded.templateId,
        handle: upgraded.handle,
        subdomainUrl: upgraded.subdomainUrl,
        pathUrl: upgraded.handle ? pathPortfolioUrl(upgraded.handle) : null,
        subscriptionState,
        emailQueued: trialMail?.emailed ?? false,
        emailTo: trialMail?.email ?? null,
        emailError: trialMail?.error ?? null,
        message: isTrial
          ? trialMail?.emailed
            ? `30-day ${result.plan} trial live${host ? ` at ${host}` : ""} · Autopay email sent to ${trialMail.email}`
            : `30-day ${result.plan} trial live${host ? ` at ${host}` : ""} · WARNING: email not queued (${trialMail?.error || "unknown"})`
          : upgraded.subdomainUrl
            ? `Pro live at ${host} · template ${upgraded.templateId}`
            : `Pro activated with template ${upgraded.templateId} (no handle yet)`,
      });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  },
);

router.post(
  "/users/:userId/revoke-plan",
  staffGuard(["super_admin", "billing"]),
  async (req: StaffRequest, res: Response) => {
    try {
      const userId = String(req.params.userId);
      const reason = String(req.body?.reason || "").trim() || "admin_revoke";
      const pauseSite = !!req.body?.pauseSite;

      const [user] = await db.select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1);
      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1);
      const rzpSubId = sub?.razorpaySubscriptionId || null;

      // Stop Autopay at Razorpay so revoked users are not charged again.
      if (rzpSubId && !rzpSubId.startsWith("mock_")) {
        const keyId = process.env.RAZORPAY_KEY_ID;
        const keySecret = process.env.RAZORPAY_KEY_SECRET;
        if (keyId && keySecret) {
          try {
            const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });
            await razorpay.subscriptions.cancel(rzpSubId, false);
          } catch (err) {
            logger.warn({ err, userId, rzpSubId }, "Admin revoke: Razorpay cancel failed");
          }
        }
      }

      await db
        .update(subscriptions)
        .set({ status: "expired", razorpaySubscriptionId: null })
        .where(eq(subscriptions.userId, userId));
      await db
        .update(profiles)
        .set({ isPremium: false })
        .where(eq(profiles.userId, userId));
      // Align with free-tier UX: drop premium template selection.
      await db.update(users).set({ templateId: "minimal" }).where(eq(users.id, userId));

      const patch: Record<string, unknown> = {
        cancelAtPeriodEnd: false,
        templateId: "minimal",
      };
      if (pauseSite) {
        patch.siteStatus = "paused";
        patch.pauseReason = "manual";
      }
      await db.update(users).set(patch).where(eq(users.id, userId));
      await recomputeUserQuota(userId);

      try {
        await db.insert(billingLedger).values({
          userId,
          eventType: "subscription_cancelled",
          amountPaise: 0,
          plan: sub?.plan || null,
          razorpaySubscriptionId: rzpSubId,
          idempotencyKey: `admin_revoke:${userId}:${Date.now()}`,
          metadata: { reason, pauseSite, source: "admin_revoke" },
        });
      } catch {
        /* ledger dedupe / non-fatal */
      }

      await audit(req, "user.revoke_plan", "user", userId, { reason, pauseSite, cancelledRazorpay: !!rzpSubId });
      const subscriptionState = await resolveSubscriptionState(userId);
      res.json({ ok: true, subscriptionState });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  },
);

router.post(
  "/users/:userId/suspend",
  staffGuard(["super_admin", "ops"]),
  async (req: StaffRequest, res: Response) => {
    try {
      const userId = String(req.params.userId);
      const reason = String(req.body?.reason || "manual");
      await db
        .update(users)
        .set({ siteStatus: "paused", pauseReason: reason })
        .where(eq(users.id, userId));
      await audit(req, "user.suspend", "user", userId, { reason });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  },
);

router.post(
  "/users/:userId/unsuspend",
  staffGuard(["super_admin", "ops"]),
  async (req: StaffRequest, res: Response) => {
    try {
      const userId = String(req.params.userId);
      await db
        .update(users)
        .set({ siteStatus: "live", pauseReason: null, graceUntil: null })
        .where(eq(users.id, userId));
      await audit(req, "user.unsuspend", "user", userId);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  },
);

router.post(
  "/users/:userId/impersonate",
  staffGuard(["super_admin"]),
  async (req: StaffRequest, res: Response) => {
    try {
      const userId = String(req.params.userId);
      const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }
      const secret = process.env.JWT_SECRET;
      if (!secret) {
        res.status(500).json({ error: "JWT misconfigured" });
        return;
      }
      const token = jwt.sign(
        { id: user.id, impersonatedBy: req.staff?.id },
        secret,
        { expiresIn: "30m" },
      );
      await audit(req, "user.impersonate", "user", userId);
      const dash =
        process.env.FRONTEND_URL ||
        process.env.WEB_URL ||
        "https://dash.mybexo.com";
      res.json({
        token,
        dashUrl: `${dash.replace(/\/$/, "")}/login?impersonate=1`,
        expiresIn: 1800,
      });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  },
);

// ——— Payments ———

router.get(
  "/payments",
  staffGuard(["super_admin", "billing"]),
  async (req: StaffRequest, res: Response) => {
    try {
      const limit = Math.min(Number(req.query.limit) || 50, 200);
      const status = typeof req.query.status === "string" ? req.query.status.trim() : "";
      const plan = typeof req.query.plan === "string" ? req.query.plan.trim() : "";
      const q = typeof req.query.q === "string" ? req.query.q.trim() : "";

      const conditions = [];
      if (status) conditions.push(eq(payments.status, status));
      if (plan) conditions.push(eq(payments.plan, plan));
      if (q) {
        conditions.push(
          or(
            ilike(users.email, `%${q}%`),
            ilike(users.name, `%${q}%`),
            ilike(profiles.handle, `%${q}%`),
            ilike(payments.razorpayPaymentId, `%${q}%`),
          )!,
        );
      }

      const rows = await db
        .select({
          id: payments.id,
          userId: payments.userId,
          amountPaise: payments.amount,
          status: payments.status,
          plan: payments.plan,
          kind: payments.kind,
          couponCode: payments.couponCode,
          razorpayPaymentId: payments.razorpayPaymentId,
          razorpayOrderId: payments.razorpayOrderId,
          razorpaySubscriptionId: payments.razorpaySubscriptionId,
          invoiceUrl: payments.invoiceUrl,
          createdAt: payments.createdAt,
          userName: users.name,
          userEmail: users.email,
          handle: profiles.handle,
        })
        .from(payments)
        .leftJoin(users, eq(users.id, payments.userId))
        .leftJoin(profiles, eq(profiles.userId, payments.userId))
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(payments.createdAt))
        .limit(limit);
      res.json({ payments: rows });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  },
);

router.get(
  "/payments/:paymentId",
  staffGuard(["super_admin", "billing"]),
  async (req: StaffRequest, res: Response) => {
    try {
      const paymentId = String(req.params.paymentId);
      const [row] = await db
        .select({
          id: payments.id,
          userId: payments.userId,
          amountPaise: payments.amount,
          status: payments.status,
          plan: payments.plan,
          kind: payments.kind,
          couponCode: payments.couponCode,
          razorpayPaymentId: payments.razorpayPaymentId,
          razorpayOrderId: payments.razorpayOrderId,
          razorpaySubscriptionId: payments.razorpaySubscriptionId,
          invoiceUrl: payments.invoiceUrl,
          createdAt: payments.createdAt,
          userName: users.name,
          userEmail: users.email,
          userPhone: users.phone,
          handle: profiles.handle,
        })
        .from(payments)
        .leftJoin(users, eq(users.id, payments.userId))
        .leftJoin(profiles, eq(profiles.userId, payments.userId))
        .where(eq(payments.id, paymentId))
        .limit(1);
      if (!row) {
        res.status(404).json({ error: "Payment not found" });
        return;
      }

      let invoiceUrl = row.invoiceUrl;
      if (row.status === "success" && !invoiceUrl) {
        try {
          invoiceUrl = (await generateAndStoreInvoice(paymentId)) || null;
        } catch (err) {
          logger.warn({ err, paymentId }, "Payment detail invoice generation failed");
        }
      }

      let ledger: Array<Record<string, unknown>> = [];
      try {
        ledger = (await db
          .select()
          .from(billingLedger)
          .where(eq(billingLedger.paymentId, paymentId))
          .orderBy(desc(billingLedger.createdAt))
          .limit(40)) as Array<Record<string, unknown>>;
      } catch (err) {
        logger.warn({ err, paymentId }, "Payment detail ledger read failed");
      }

      res.json({ payment: { ...row, invoiceUrl }, ledger });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  },
);

router.post(
  "/payments/:paymentId/refund",
  staffGuard(["super_admin", "billing"]),
  async (req: StaffRequest, res: Response) => {
    try {
      const paymentId = String(req.params.paymentId);
      const reason = String(req.body?.reason || "").trim() || "admin_refund";
      const partial = req.body?.amountPaise != null ? Math.floor(Number(req.body.amountPaise)) : null;
      const revokeEntitlement = req.body?.revokeEntitlement !== false; // default true on full refund

      const [row] = await db.select().from(payments).where(eq(payments.id, paymentId)).limit(1);
      if (!row) {
        res.status(404).json({ error: "Payment not found" });
        return;
      }
      if (row.status !== "success" && row.status !== "awaiting_mandate") {
        res.status(400).json({ error: `Cannot refund payment in status “${row.status}”` });
        return;
      }
      if (!row.razorpayPaymentId) {
        res.status(400).json({ error: "No Razorpay payment id on this row" });
        return;
      }

      const keyId = process.env.RAZORPAY_KEY_ID;
      const keySecret = process.env.RAZORPAY_KEY_SECRET;
      if (!keyId || !keySecret) {
        res.status(503).json({ error: "Razorpay not configured" });
        return;
      }

      const amountPaise =
        partial != null && partial > 0 && partial < row.amount ? partial : row.amount;
      const isPartial = amountPaise < row.amount;

      // CAS claim: prevent double refund from concurrent admin tabs.
      if (!isPartial) {
        const [claimed] = await db
          .update(payments)
          .set({ status: "refunded" })
          .where(
            and(
              eq(payments.id, paymentId),
              sql`${payments.status} in ('success','awaiting_mandate')`,
            ),
          )
          .returning({ id: payments.id });
        if (!claimed) {
          res.status(409).json({ error: "Payment already refunded or not refundable" });
          return;
        }
      }

      const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });
      let refund: any;
      try {
        refund = await razorpay.payments.refund(row.razorpayPaymentId, {
          amount: amountPaise,
          notes: { reason, adminStaffId: req.staff?.id || "" },
        });
      } catch (rzpErr) {
        // Roll back optimistic status if Razorpay refund failed on full refund claim.
        if (!isPartial) {
          await db
            .update(payments)
            .set({ status: row.status })
            .where(eq(payments.id, paymentId));
        }
        throw rzpErr;
      }

      const refundId = refund?.id || null;
      if (!refundId) {
        if (!isPartial) {
          await db.update(payments).set({ status: row.status }).where(eq(payments.id, paymentId));
        }
        res.status(502).json({ error: "Razorpay did not return a refund id" });
        return;
      }

      await db.insert(billingLedger).values({
        userId: row.userId,
        paymentId: row.id,
        eventType: isPartial ? "payment_partial_refund" : "payment_refunded",
        amountPaise: -amountPaise,
        plan: row.plan,
        razorpayPaymentId: row.razorpayPaymentId,
        razorpayRefundId: refundId,
        idempotencyKey: `admin_refund:${paymentId}:${refundId}`,
        metadata: { reason, isPartial, staffId: req.staff?.id },
      });

      // Full refund of a plan payment → revoke entitlement + stop Autopay.
      let revoked = false;
      if (!isPartial && revokeEntitlement && row.plan && row.plan !== "storage_addon") {
        const [sub] = await db
          .select()
          .from(subscriptions)
          .where(eq(subscriptions.userId, row.userId))
          .limit(1);
        const rzpSubId = sub?.razorpaySubscriptionId || null;
        if (rzpSubId && !rzpSubId.startsWith("mock_")) {
          try {
            await razorpay.subscriptions.cancel(rzpSubId, false);
          } catch (err) {
            logger.warn({ err, userId: row.userId, rzpSubId }, "Admin refund: Autopay cancel failed");
          }
        }
        await db
          .update(subscriptions)
          .set({ status: "expired", razorpaySubscriptionId: null })
          .where(eq(subscriptions.userId, row.userId));
        await db.update(profiles).set({ isPremium: false }).where(eq(profiles.userId, row.userId));
        await db
          .update(users)
          .set({ templateId: "minimal", cancelAtPeriodEnd: false })
          .where(eq(users.id, row.userId));
        await recomputeUserQuota(row.userId);
        revoked = true;
      }

      try {
        const [u] = await db.select().from(users).where(eq(users.id, row.userId)).limit(1);
        if (u?.email) {
          const { sendRefundEmail } = await import("../lib/billing");
          await sendRefundEmail({
            email: u.email,
            userName: u.name || "there",
            plan: row.plan || "plan",
            amountInr: amountPaise / 100,
            refundId,
            userId: row.userId,
            reason,
            isPartial,
          });
        }
      } catch (mailErr) {
        logger.warn({ mailErr, paymentId }, "Admin refund email failed (non-fatal)");
      }

      await audit(req, isPartial ? "payment.partial_refund" : "payment.refund", "payment", paymentId, {
        amountPaise,
        refundId,
        reason,
        revoked,
      });

      res.json({
        ok: true,
        refundId,
        amountPaise,
        isPartial,
        revoked,
        status: isPartial ? row.status : "refunded",
      });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  },
);

router.post(
  "/payments/:paymentId/ensure-invoice",
  staffGuard(["super_admin", "billing"]),
  async (req: StaffRequest, res: Response) => {
    try {
      const paymentId = String(req.params.paymentId);
      const url = await generateAndStoreInvoice(paymentId);
      if (!url) {
        res.status(400).json({ error: "Could not generate invoice (payment missing or unpaid)" });
        return;
      }
      await audit(req, "payment.ensure_invoice", "payment", paymentId, { url });
      res.json({ ok: true, invoiceUrl: url });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  },
);

router.get(
  "/subscriptions",
  staffGuard(["super_admin", "billing"]),
  async (req: StaffRequest, res: Response) => {
    try {
      const plan = typeof req.query.plan === "string" ? req.query.plan.trim() : "";
      const status = typeof req.query.status === "string" ? req.query.status.trim() : "";
      const conditions = [];
      if (plan) conditions.push(eq(subscriptions.plan, plan));
      if (status) conditions.push(eq(subscriptions.status, status));

      const rows = await db
        .select({
          id: subscriptions.id,
          userId: subscriptions.userId,
          plan: subscriptions.plan,
          status: subscriptions.status,
          expiresAt: subscriptions.expiresAt,
          razorpaySubscriptionId: subscriptions.razorpaySubscriptionId,
          createdAt: subscriptions.createdAt,
          userName: users.name,
          userEmail: users.email,
          handle: profiles.handle,
        })
        .from(subscriptions)
        .leftJoin(users, eq(users.id, subscriptions.userId))
        .leftJoin(profiles, eq(profiles.userId, subscriptions.userId))
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(subscriptions.createdAt))
        .limit(200);
      res.json({ subscriptions: rows });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  },
);

// ——— Reports & export (super_admin) ———

router.get(
  "/reports/summary",
  staffGuard(["super_admin"]),
  async (_req: StaffRequest, res: Response) => {
    try {
      const since30 = new Date(Date.now() - 30 * 86400000);
      const [
        [{ usersTotal }],
        [{ paidActive }],
        [{ payments30 }],
        [{ revenue30 }],
        planMix,
        paymentStatus,
      ] = await Promise.all([
        db.select({ usersTotal: count() }).from(users),
        db
          .select({ paidActive: count() })
          .from(subscriptions)
          .where(eq(subscriptions.status, "active")),
        db
          .select({ payments30: count() })
          .from(payments)
          .where(and(eq(payments.status, "success"), gte(payments.createdAt, since30))),
        db
          .select({ revenue30: sql<number>`coalesce(sum(${payments.amount}),0)::int` })
          .from(payments)
          .where(and(eq(payments.status, "success"), gte(payments.createdAt, since30))),
        db
          .select({ plan: subscriptions.plan, status: subscriptions.status, count: count() })
          .from(subscriptions)
          .groupBy(subscriptions.plan, subscriptions.status),
        db
          .select({ status: payments.status, count: count() })
          .from(payments)
          .groupBy(payments.status),
      ]);

      res.json({
        generatedAt: new Date().toISOString(),
        usersTotal,
        paidActive,
        paymentsLast30d: payments30,
        revenueInrLast30d: Math.round(Number(revenue30 || 0) / 100),
        planMix,
        paymentStatus,
      });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  },
);

router.get(
  "/reports/export",
  staffGuard(["super_admin"]),
  async (req: StaffRequest, res: Response) => {
    try {
      const kind = String(req.query.kind || "users");
      const format = String(req.query.format || "csv");

      if (format !== "csv" && format !== "json") {
        res.status(400).json({ error: "format must be csv or json" });
        return;
      }

      let headers: string[] = [];
      let rows: unknown[][] = [];
      let jsonPayload: unknown = null;

      if (kind === "users") {
        const data = await db
          .select({
            id: users.id,
            name: users.name,
            email: users.email,
            phone: users.phone,
            handle: profiles.handle,
            plan: subscriptions.plan,
            subStatus: subscriptions.status,
            siteStatus: users.siteStatus,
            templateId: users.templateId,
            createdAt: users.createdAt,
          })
          .from(users)
          .leftJoin(profiles, eq(profiles.userId, users.id))
          .leftJoin(subscriptions, eq(subscriptions.userId, users.id))
          .orderBy(desc(users.createdAt))
          .limit(5000);
        headers = [
          "id",
          "name",
          "email",
          "phone",
          "handle",
          "plan",
          "sub_status",
          "site_status",
          "template",
          "created_at",
        ];
        rows = data.map((u) => [
          u.id,
          u.name,
          u.email,
          u.phone,
          u.handle,
          u.plan,
          u.subStatus,
          u.siteStatus,
          u.templateId,
          u.createdAt?.toISOString?.() || u.createdAt,
        ]);
        jsonPayload = data;
      } else if (kind === "payments") {
        const data = await db
          .select({
            id: payments.id,
            userId: payments.userId,
            email: users.email,
            handle: profiles.handle,
            amountPaise: payments.amount,
            status: payments.status,
            plan: payments.plan,
            coupon: payments.couponCode,
            razorpayPaymentId: payments.razorpayPaymentId,
            invoiceUrl: payments.invoiceUrl,
            createdAt: payments.createdAt,
          })
          .from(payments)
          .leftJoin(users, eq(users.id, payments.userId))
          .leftJoin(profiles, eq(profiles.userId, payments.userId))
          .orderBy(desc(payments.createdAt))
          .limit(5000);
        headers = [
          "id",
          "user_id",
          "email",
          "handle",
          "amount_paise",
          "status",
          "plan",
          "coupon",
          "razorpay_payment_id",
          "invoice_url",
          "created_at",
        ];
        rows = data.map((p) => [
          p.id,
          p.userId,
          p.email,
          p.handle,
          p.amountPaise,
          p.status,
          p.plan,
          p.coupon,
          p.razorpayPaymentId,
          p.invoiceUrl,
          p.createdAt?.toISOString?.() || p.createdAt,
        ]);
        jsonPayload = data;
      } else if (kind === "subscriptions") {
        const data = await db
          .select({
            id: subscriptions.id,
            userId: subscriptions.userId,
            email: users.email,
            handle: profiles.handle,
            plan: subscriptions.plan,
            status: subscriptions.status,
            expiresAt: subscriptions.expiresAt,
            razorpaySubscriptionId: subscriptions.razorpaySubscriptionId,
          })
          .from(subscriptions)
          .leftJoin(users, eq(users.id, subscriptions.userId))
          .leftJoin(profiles, eq(profiles.userId, subscriptions.userId))
          .orderBy(desc(subscriptions.createdAt))
          .limit(5000);
        headers = [
          "id",
          "user_id",
          "email",
          "handle",
          "plan",
          "status",
          "expires_at",
          "razorpay_subscription_id",
        ];
        rows = data.map((s) => [
          s.id,
          s.userId,
          s.email,
          s.handle,
          s.plan,
          s.status,
          s.expiresAt?.toISOString?.() || s.expiresAt,
          s.razorpaySubscriptionId,
        ]);
        jsonPayload = data;
      } else {
        res.status(400).json({ error: "kind must be users | payments | subscriptions" });
        return;
      }

      await audit(req, "report.export", "report", kind, { format, rows: rows.length });

      if (format === "json") {
        res.json({ kind, generatedAt: new Date().toISOString(), rows: jsonPayload });
        return;
      }

      const csv = toCsv(headers, rows);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="bexo-${kind}-${new Date().toISOString().slice(0, 10)}.csv"`,
      );
      res.send(csv);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  },
);

// ——— Coupons & plans ———

router.get(
  "/pricing/plans",
  staffGuard(["super_admin", "billing", "ops"]),
  async (_req: StaffRequest, res: Response) => {
    const plans = await db.select().from(pricingPlans).orderBy(pricingPlans.sortOrder);
    res.json({ plans });
  },
);

router.post(
  "/pricing/plans",
  staffGuard(["super_admin", "billing"]),
  async (req: StaffRequest, res: Response) => {
    try {
      const id = String(req.body?.id || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, "");
      if (!id) {
        res.status(400).json({ error: "id required (e.g. identity, essential)" });
        return;
      }
      const [existing] = await db.select().from(pricingPlans).where(eq(pricingPlans.id, id)).limit(1);
      if (existing) {
        res.status(409).json({ error: "Plan id already exists — edit instead" });
        return;
      }
      const displayName = String(req.body?.displayName || id).trim();
      const priceInrExGst = Math.max(0, Math.floor(Number(req.body?.priceInrExGst) || 0));
      const storageBytes = Math.max(0, Math.floor(Number(req.body?.storageBytes) || 10 * 1024 * 1024));
      const features = Array.isArray(req.body?.features)
        ? req.body.features.map(String)
        : [];
      const [row] = await db
        .insert(pricingPlans)
        .values({
          id,
          displayName,
          subtitle: req.body?.subtitle != null ? String(req.body.subtitle) : null,
          priceInrExGst,
          storageBytes,
          isPurchasable: req.body?.isPurchasable !== false,
          sortOrder: Number(req.body?.sortOrder) || 50,
          isHighlighted: !!req.body?.isHighlighted,
          features,
          isActive: req.body?.isActive !== false,
          billingPeriod: String(req.body?.billingPeriod || "monthly"),
          parsesPerMonth: Number(req.body?.parsesPerMonth) || 0,
          updatesPerMonth: Number(req.body?.updatesPerMonth) || 1,
          razorpayPlanId: req.body?.razorpayPlanId ? String(req.body.razorpayPlanId) : null,
          updatedAt: new Date(),
        })
        .returning();
      invalidatePricingCache();
      await audit(req, "plan.create", "pricing_plan", id, { displayName, priceInrExGst });
      res.json({ plan: row });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  },
);

router.patch(
  "/pricing/plans/:planId",
  staffGuard(["super_admin", "billing"]),
  async (req: StaffRequest, res: Response) => {
    try {
      const planId = String(req.params.planId);
      const [before] = await db.select().from(pricingPlans).where(eq(pricingPlans.id, planId)).limit(1);
      if (!before) {
        res.status(404).json({ error: "Plan not found" });
        return;
      }

      const patch: Record<string, unknown> = { updatedAt: new Date() };
      for (const key of [
        "displayName",
        "subtitle",
        "priceInrExGst",
        "storageBytes",
        "isPurchasable",
        "isActive",
        "isHighlighted",
        "sortOrder",
        "billingPeriod",
        "parsesPerMonth",
        "updatesPerMonth",
        "razorpayPlanId",
      ] as const) {
        if (req.body?.[key] !== undefined) patch[key] = req.body[key];
      }
      if (req.body?.features !== undefined) {
        patch.features = Array.isArray(req.body.features) ? req.body.features.map(String) : [];
      }
      if (!Object.keys(patch).length || Object.keys(patch).length === 1) {
        res.status(400).json({ error: "No fields to update" });
        return;
      }

      await db.update(pricingPlans).set(patch).where(eq(pricingPlans.id, planId));
      invalidatePricingCache();

      let notified = 0;
      if (
        req.body?.priceInrExGst !== undefined &&
        Number(req.body.priceInrExGst) !== Number(before.priceInrExGst) &&
        req.body?.notifySubscribers !== false
      ) {
        const result = await notifyPlanPriceChange({
          planId,
          planLabel: String(patch.displayName || before.displayName),
          oldPriceInr: Number(before.priceInrExGst),
          newPriceInr: Number(req.body.priceInrExGst),
        });
        notified = result.emailed;
      }

      await audit(req, "plan.update", "pricing_plan", planId, { ...patch, notified });
      const catalog = await loadPricingCatalog(true);
      res.json({
        ok: true,
        notified,
        publicPlans: catalog.plans.length,
        note: "Active plans appear on web app + marketing via GET /api/pricing",
      });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  },
);

router.get(
  "/pricing/coupons",
  staffGuard(["super_admin", "billing"]),
  async (_req: StaffRequest, res: Response) => {
    const coupons = await db.select().from(pricingCoupons).orderBy(desc(pricingCoupons.createdAt));
    res.json({ coupons });
  },
);

function parseCouponBody(body: any, partial = false) {
  const patch: Record<string, unknown> = {};
  if (!partial || body?.code !== undefined) {
    const code = String(body?.code || "")
      .toUpperCase()
      .trim();
    if (!partial && !code) throw new Error("code required");
    if (code) patch.code = code;
  }
  if (body?.description !== undefined) patch.description = body.description || null;
  if (body?.discountType !== undefined) patch.discountType = String(body.discountType);
  if (body?.percentOff !== undefined) {
    patch.percentOff = body.percentOff === null || body.percentOff === "" ? null : Number(body.percentOff);
  }
  if (body?.inrOff !== undefined) {
    patch.inrOff = body.inrOff === null || body.inrOff === "" ? null : Number(body.inrOff);
  }
  if (body?.planPrices !== undefined) {
    patch.planPrices =
      body.planPrices && typeof body.planPrices === "object" ? body.planPrices : null;
  }
  if (body?.allowedPlans !== undefined) {
    if (body.allowedPlans == null || body.allowedPlans === "") patch.allowedPlans = null;
    else if (Array.isArray(body.allowedPlans)) patch.allowedPlans = body.allowedPlans.map(String);
    else if (typeof body.allowedPlans === "string") {
      patch.allowedPlans = body.allowedPlans
        .split(",")
        .map((s: string) => s.trim())
        .filter(Boolean);
    }
  }
  if (body?.firstCustomerOnly !== undefined) patch.firstCustomerOnly = !!body.firstCustomerOnly;
  if (body?.appliesOnce !== undefined) patch.appliesOnce = !!body.appliesOnce;
  if (body?.isActive !== undefined) patch.isActive = !!body.isActive;
  if (body?.maxUses !== undefined) {
    patch.maxUses = body.maxUses === null || body.maxUses === "" ? null : Number(body.maxUses);
  }
  if (body?.validFrom !== undefined) {
    patch.validFrom = body.validFrom ? new Date(body.validFrom) : null;
  }
  if (body?.validUntil !== undefined) {
    patch.validUntil = body.validUntil ? new Date(body.validUntil) : null;
  }
  return patch;
}

router.post(
  "/pricing/coupons",
  staffGuard(["super_admin", "billing"]),
  async (req: StaffRequest, res: Response) => {
    try {
      const values = parseCouponBody(req.body, false);
      if (!values.discountType) values.discountType = "percent";
      const [row] = await db
        .insert(pricingCoupons)
        .values(values as any)
        .returning();
      await audit(req, "coupon.create", "pricing_coupon", row.id, { code: row.code });
      res.json({ coupon: row });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  },
);

router.patch(
  "/pricing/coupons/:couponId",
  staffGuard(["super_admin", "billing"]),
  async (req: StaffRequest, res: Response) => {
    try {
      const couponId = String(req.params.couponId);
      const patch = parseCouponBody(req.body, true);
      patch.updatedAt = new Date();
      if (Object.keys(patch).length <= 1) {
        res.status(400).json({ error: "No fields to update" });
        return;
      }
      const [row] = await db
        .update(pricingCoupons)
        .set(patch)
        .where(eq(pricingCoupons.id, couponId))
        .returning();
      if (!row) {
        res.status(404).json({ error: "Coupon not found" });
        return;
      }
      await audit(req, "coupon.update", "pricing_coupon", couponId, patch);
      res.json({ ok: true, coupon: row });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  },
);

router.delete(
  "/pricing/coupons/:couponId",
  staffGuard(["super_admin"]),
  async (req: StaffRequest, res: Response) => {
    try {
      const couponId = String(req.params.couponId);
      const [coupon] = await db
        .select({ id: pricingCoupons.id, code: pricingCoupons.code })
        .from(pricingCoupons)
        .where(eq(pricingCoupons.id, couponId))
        .limit(1);
      if (!coupon) {
        res.status(404).json({ error: "Coupon not found" });
        return;
      }
      // Hard delete — redemptions cascade. Plans are never deleted from Admin.
      await db.delete(pricingCoupons).where(eq(pricingCoupons.id, couponId));
      await audit(req, "coupon.delete", "pricing_coupon", couponId, { code: coupon.code });
      res.json({ ok: true, deleted: true, code: coupon.code });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  },
);

// ——— Support notes (tickets live in adminSupport.ts) ———

router.post(
  "/support/notes",
  staffGuard(["super_admin", "support", "ops", "billing"]),
  async (req: StaffRequest, res: Response) => {
    try {
      const targetType = String(req.body?.targetType || "");
      const targetId = String(req.body?.targetId || "");
      const body = String(req.body?.body || "").trim();
      if (!targetType || !targetId || !body) {
        res.status(400).json({ error: "targetType, targetId, body required" });
        return;
      }
      const [note] = await db
        .insert(supportNotes)
        .values({
          targetType,
          targetId,
          body,
          authorStaffId: req.staff?.id,
        })
        .returning();
      await audit(req, "support.note", targetType, targetId);
      res.json({ note });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  },
);

// ——— Staff management ———

router.get(
  "/staff",
  staffGuard(["super_admin"]),
  async (_req: StaffRequest, res: Response) => {
    const rows = await db
      .select({
        id: staffUsers.id,
        email: staffUsers.email,
        name: staffUsers.name,
        phone: staffUsers.phone,
        role: staffUsers.role,
        isActive: staffUsers.isActive,
        mustChangePassword: staffUsers.mustChangePassword,
        lastLoginAt: staffUsers.lastLoginAt,
        createdAt: staffUsers.createdAt,
      })
      .from(staffUsers)
      .orderBy(desc(staffUsers.createdAt));
    res.json({ staff: rows });
  },
);

router.post(
  "/staff/invite",
  staffGuard(["super_admin"]),
  async (req: StaffRequest, res: Response) => {
    try {
      const email = String(req.body?.email || "")
        .toLowerCase()
        .trim();
      const name = String(req.body?.name || "").trim() || null;
      const phone = String(req.body?.phone || "").trim() || null;
      const role = (String(req.body?.role || "support") as StaffRole) || "support";
      if (!email) {
        res.status(400).json({ error: "email required" });
        return;
      }

      const issued = await issueStaffInvite({
        email,
        name,
        phone,
        role,
        invitedBy: req.staff?.id,
      });

      await audit(req, "staff.invite", "staff_invite", issued.invite.id, {
        email,
        role,
        name,
        phone,
        emailSent: issued.emailSent,
        expiresAt: issued.expiresAt.toISOString(),
      });

      res.json({
        invite: {
          id: issued.invite.id,
          email,
          name,
          phone,
          role,
          expiresAt: issued.expiresAt,
        },
        acceptToken: undefined,
        inviteUrl: issued.inviteUrl,
        loginUrl: issued.loginUrl,
        temporaryPassword: issued.temporaryPassword,
        emailSent: issued.emailSent,
        emailError: issued.emailError || null,
        message: issued.emailSent
          ? "Invite created and email sent with temporary password (expires in 7 days)."
          : `Invite created (expires in 7 days). Email not sent: ${issued.emailError || "unknown error"}. Share the link and password manually.`,
      });
    } catch (err: any) {
      const status = Number(err?.status) || 500;
      res.status(status).json({ error: err?.message || "Failed to create invite", code: err?.code });
    }
  },
);

router.patch(
  "/staff/:staffId",
  staffGuard(["super_admin"]),
  async (req: StaffRequest, res: Response) => {
    try {
      const staffId = String(req.params.staffId);
      const [existing] = await db.select().from(staffUsers).where(eq(staffUsers.id, staffId)).limit(1);
      if (!existing) {
        res.status(404).json({ error: "Staff member not found" });
        return;
      }

      const patch: Record<string, unknown> = { updatedAt: new Date() };
      if (req.body?.role !== undefined) {
        const role = String(req.body.role);
        if (!["super_admin", "billing", "ops", "support"].includes(role)) {
          res.status(400).json({ error: "Invalid role" });
          return;
        }
        patch.role = role;
      }
      if (req.body?.isActive !== undefined) patch.isActive = !!req.body.isActive;
      if (req.body?.name !== undefined) patch.name = String(req.body.name || "").trim() || null;
      if (req.body?.phone !== undefined) patch.phone = String(req.body.phone || "").trim() || null;
      if (req.body?.email !== undefined) {
        const nextEmail = String(req.body.email || "")
          .toLowerCase()
          .trim();
        if (!nextEmail.includes("@")) {
          res.status(400).json({ error: "Valid email required" });
          return;
        }
        if (nextEmail !== existing.email) {
          const [taken] = await db
            .select({ id: staffUsers.id })
            .from(staffUsers)
            .where(eq(staffUsers.email, nextEmail))
            .limit(1);
          if (taken) {
            res.status(409).json({ error: "Another staff account already uses that email." });
            return;
          }
          patch.email = nextEmail;
        }
      }

      if (
        req.staff?.id === staffId &&
        ((patch.role && patch.role !== "super_admin") || patch.isActive === false)
      ) {
        res.status(400).json({ error: "You cannot demote or deactivate your own account." });
        return;
      }

      const [updated] = await db
        .update(staffUsers)
        .set(patch)
        .where(eq(staffUsers.id, staffId))
        .returning({
          id: staffUsers.id,
          email: staffUsers.email,
          name: staffUsers.name,
          phone: staffUsers.phone,
          role: staffUsers.role,
          isActive: staffUsers.isActive,
          mustChangePassword: staffUsers.mustChangePassword,
          lastLoginAt: staffUsers.lastLoginAt,
          createdAt: staffUsers.createdAt,
        });
      await audit(req, "staff.update", "staff_user", staffId, patch);
      res.json({ ok: true, staff: updated });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  },
);

router.post(
  "/staff/:staffId/reset-password",
  staffGuard(["super_admin"]),
  async (req: StaffRequest, res: Response) => {
    try {
      const staffId = String(req.params.staffId);
      const { issueStaffPasswordReset } = await import("../lib/staffInvite");
      const issued = await issueStaffPasswordReset({
        staffId,
        invitedBy: req.staff?.id,
      });
      await audit(req, "staff.reset_password", "staff_user", staffId, {
        email: issued.email,
        emailSent: issued.emailSent,
      });
      res.json({
        ...issued,
        message: issued.emailSent
          ? "Password reset email sent with a temporary password and reset link (24h)."
          : `Reset prepared but email failed: ${issued.emailError || "unknown"}. Share the temp password and link manually.`,
      });
    } catch (err: any) {
      const status = Number(err?.status) || 500;
      res.status(status).json({ error: err?.message || "Failed to reset password", code: err?.code });
    }
  },
);

router.get(
  "/audit",
  staffGuard(["super_admin", "ops"]),
  async (req: StaffRequest, res: Response) => {
    try {
      const limit = Math.min(Number(req.query.limit) || 100, 500);
      const q = String(req.query.q || "").trim().toLowerCase();
      const fetchLimit = q ? Math.min(2000, limit * 10) : limit;
      const rows = await db
        .select({
          id: adminAuditLog.id,
          action: adminAuditLog.action,
          targetType: adminAuditLog.targetType,
          targetId: adminAuditLog.targetId,
          meta: adminAuditLog.meta,
          ip: adminAuditLog.ip,
          createdAt: adminAuditLog.createdAt,
          actorStaffId: adminAuditLog.actorStaffId,
          actorEmail: staffUsers.email,
          actorName: staffUsers.name,
          actorRole: staffUsers.role,
          actorPhone: staffUsers.phone,
          actorIsActive: staffUsers.isActive,
        })
        .from(adminAuditLog)
        .leftJoin(staffUsers, eq(adminAuditLog.actorStaffId, staffUsers.id))
        .orderBy(desc(adminAuditLog.createdAt))
        .limit(fetchLimit);

      const filtered = q
        ? rows.filter((r) => {
            const hay =
              `${r.action} ${r.targetType} ${r.targetId} ${r.actorEmail} ${r.actorName} ${r.actorRole} ${r.actorPhone} ${r.ip} ${JSON.stringify(r.meta)}`.toLowerCase();
            return hay.includes(q);
          })
        : rows;
      const entries = filtered.slice(0, limit);

      res.json({ entries, total: entries.length, searched: Boolean(q) });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  },
);

// ——— Templates catalog ———

const KNOWN_TEMPLATE_META: Record<
  string,
  { premium: boolean; engine: string; label: string; category: string; sortOrder: number }
> = {
  minimal: {
    premium: false,
    engine: "spa-minimal",
    label: "Minimal (free)",
    category: "free",
    sortOrder: 0,
  },
  "cura-futuri": {
    premium: true,
    engine: "bundle",
    label: "Cura Futuri",
    category: "premium",
    sortOrder: 10,
  },
  "sierra-montana": {
    premium: true,
    engine: "bundle",
    label: "Sierra Montana",
    category: "premium",
    sortOrder: 20,
  },
  "nico-palmer": {
    premium: true,
    engine: "bundle",
    label: "Nico Palmer",
    category: "premium",
    sortOrder: 30,
  },
};

router.get(
  "/templates",
  staffGuard(["super_admin", "ops", "billing", "support"]),
  async (_req: StaffRequest, res: Response) => {
    try {
      const rows = await db.select().from(templates);
      const usage = await db
        .select({ templateId: users.templateId, count: count() })
        .from(users)
        .groupBy(users.templateId);

      const usageMap = new Map(usage.map((u) => [u.templateId || "minimal", Number(u.count)]));

      // Ensure known premium templates appear even if not seeded in DB yet
      const byId = new Map(rows.map((r) => [r.id, r]));
      for (const id of Object.keys(KNOWN_TEMPLATE_META)) {
        if (!byId.has(id)) {
          const meta = KNOWN_TEMPLATE_META[id];
          byId.set(id, {
            id,
            name: meta.label,
            description: null,
            category: meta.category,
            premium: meta.premium,
            isActive: true,
            sortOrder: meta.sortOrder,
            engine: meta.engine,
            updatedAt: null,
          } as any);
        }
      }

      const list = [...byId.values()]
        .map((t) => {
          const meta = KNOWN_TEMPLATE_META[t.id] || {
            premium: t.id !== "minimal",
            engine: (t as any).engine || "unknown",
            label: t.name,
            category: (t as any).category || "general",
            sortOrder: (t as any).sortOrder || 50,
          };
          return {
            id: t.id,
            name: t.name || meta.label,
            description: t.description,
            category: (t as any).category || meta.category,
            premium: (t as any).premium ?? meta.premium,
            isActive: (t as any).isActive !== false,
            sortOrder: (t as any).sortOrder ?? meta.sortOrder,
            engine: (t as any).engine || meta.engine,
            usersCount: usageMap.get(t.id) || 0,
          };
        })
        .sort((a, b) => a.sortOrder - b.sortOrder);

      res.json({ templates: list, categories: ["free", "premium", "experimental", "general"] });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  },
);

router.patch(
  "/templates/:templateId",
  staffGuard(["super_admin", "ops"]),
  async (req: StaffRequest, res: Response) => {
    try {
      const templateId = String(req.params.templateId);
      const patch: Record<string, unknown> = { updatedAt: new Date() };
      for (const key of [
        "name",
        "description",
        "category",
        "premium",
        "isActive",
        "sortOrder",
        "engine",
      ] as const) {
        if (req.body?.[key] !== undefined) patch[key] = req.body[key];
      }
      if (Object.keys(patch).length <= 1) {
        res.status(400).json({ error: "No fields to update" });
        return;
      }

      const [existing] = await db.select().from(templates).where(eq(templates.id, templateId)).limit(1);
      if (existing) {
        await db.update(templates).set(patch).where(eq(templates.id, templateId));
      } else {
        const meta = KNOWN_TEMPLATE_META[templateId];
        await db.insert(templates).values({
          id: templateId,
          name: String(patch.name || meta?.label || templateId),
          description: (patch.description as string) || null,
          category: String(patch.category || meta?.category || "general"),
          premium: patch.premium !== undefined ? !!patch.premium : !!meta?.premium,
          isActive: patch.isActive !== undefined ? !!patch.isActive : true,
          sortOrder: Number(patch.sortOrder ?? meta?.sortOrder ?? 50),
          engine: String(patch.engine || meta?.engine || "bundle"),
        });
      }
      await audit(req, "template.update", "template", templateId, patch);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  },
);

router.post(
  "/users/:userId/assign-template",
  staffGuard(["super_admin", "ops"]),
  async (req: StaffRequest, res: Response) => {
    try {
      const userId = String(req.params.userId);
      const templateId = String(req.body?.templateId || "").trim();
      if (!templateId) {
        res.status(400).json({ error: "templateId required" });
        return;
      }
      const meta = KNOWN_TEMPLATE_META[templateId];
      if (!meta && templateId !== "minimal") {
        // allow any id that exists in templates table
        const [row] = await db.select().from(templates).where(eq(templates.id, templateId)).limit(1);
        if (!row) {
          res.status(400).json({ error: "Unknown templateId" });
          return;
        }
      }

      const state = await resolveSubscriptionState(userId);
      if (meta?.premium && !state.isPremium) {
        res.status(400).json({
          error: "User is on free plan — grant a paid plan before assigning a premium template",
        });
        return;
      }

      await db.update(users).set({ templateId }).where(eq(users.id, userId));
      await db.update(profiles).set({ templateId }).where(eq(profiles.userId, userId));
      await audit(req, "user.assign_template", "user", userId, { templateId });
      res.json({ ok: true, templateId });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  },
);

// ——— Platform control surface ———

router.get(
  "/platform",
  staffGuard(["super_admin", "ops", "billing"]),
  async (_req: StaffRequest, res: Response) => {
    try {
      const [
        [{ usersTotal }],
        [{ published }],
        [{ paidActive }],
        templateUsage,
      ] = await Promise.all([
        db.select({ usersTotal: count() }).from(users),
        db
          .select({ published: count() })
          .from(users)
          .where(sql`${users.onboardingCompletedAt} is not null`),
        db
          .select({ paidActive: count() })
          .from(subscriptions)
          .where(eq(subscriptions.status, "active")),
        db
          .select({ templateId: users.templateId, count: count() })
          .from(users)
          .groupBy(users.templateId),
      ]);

      res.json({
        surfaces: {
          marketing: process.env.MARKETING_URL || "https://mybexo.com",
          dash: process.env.FRONTEND_URL || process.env.WEB_URL || "https://dash.mybexo.com",
          admin: process.env.ADMIN_URL || "https://admin.mybexo.com",
          api: process.env.PUBLIC_API_URL || "https://bexo-api-557785925639.asia-south1.run.app",
          platformDomain: process.env.PLATFORM_DOMAIN || "atbexo.com",
        },
        health: {
          usersTotal,
          publishedPortfolios: published,
          paidActive,
          templateUsage: templateUsage.map((t) => ({
            templateId: t.templateId || "minimal",
            count: Number(t.count),
          })),
        },
        notes: [
          "Free portfolios: mybexo.com/{handle} (marketing free-path rewrite)",
          "Premium portfolios: {handle}.atbexo.com via Worker → Cloud Run",
          "Marketing: mybexo.com (Firebase bexo-marketing); atbexo.com apex redirects to marketing",
          "Grant plans & assign templates from Users dossier",
        ],
      });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  },
);

registerAdminSupport(router);
registerAdminMarketingLeads(router);
registerAdminExtras(router);
registerAdminActivation(router);

router.post(
  "/users/purge-incomplete",
  staffGuard(["super_admin"]),
  async (req: StaffRequest, res: Response) => {
    try {
      const immediate = req.body?.immediate !== false;
      const { purgeIncompleteAndTestUsersOnce, purgeAbandonedPhoneOnlyUsers } = await import(
        "../lib/userRetention"
      );
      const result = immediate
        ? await purgeIncompleteAndTestUsersOnce()
        : await purgeAbandonedPhoneOnlyUsers({ olderThanDays: 7, limit: 500 });
      await audit(req, "users.purge_incomplete", "users", undefined, result as unknown as Record<string, unknown>);
      res.json({ ok: true, ...result });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  },
);

export default router;
