import { Router } from "express";
import { db, users, payments, subscriptions, addonSubscriptions, activationKeys, profiles } from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";
import { logger } from "../lib/logger";
import Razorpay from "razorpay";
import crypto from "crypto";
import { sendBillingEmail, sendBillingWhatsApp, sendCancellationEmail, sendRefundEmail } from "../lib/billing";
import { markOnboardingComplete } from "../lib/lifecycleEmails";
import { requireAuth } from "../middlewares/auth";
import {
  FREE_STORAGE_BYTES,
  STORAGE_BLOCK_BYTES,
  SUBSCRIPTION_PLANS,
  activatePaidPlan,
  addMonthlyTerm,
  getGrantingAddons,
  getStorageAddonControl,
  getRenewalExpiry,
  isPaidPlan,
  normalizePlanId,
  planBillingPeriod,
  planTermEnd,
  recomputeUserQuota,
  resolveSubscriptionState,
  type PaidPlan,
} from "../lib/subscriptions";
import {
  buildCheckoutQuote,
  calculatePlanAmount,
  findActiveCoupon,
  getPlanById,
  hasUserRedeemedCoupon,
  loadPricingCatalog,
  recordCouponRedemption,
  toPublicPricingPayload,
} from "../lib/pricingCatalog";
import { generateAndStoreInvoice, backfillMissingInvoices } from "../lib/invoiceStore";
import { getPlanLimits, getUpdatesUsage, getParsesUsage } from "../lib/entitlements";
import {
  claimWebhookEvent,
  isMandateReadyStatus,
  markWebhookProcessed,
  recordLedgerEvent,
} from "../lib/billingEngine";
import {
  clearPaymentGrace,
  enterPaymentGrace,
  resolveSiteAccess,
  setCancelAtPeriodEnd,
} from "../lib/siteAccess";
import { enqueueEmail } from "../lib/emailOutbox";
import {
  ensureBillingProfileForCheckout,
  getBillingProfile,
  toPublicBillingProfile,
  upsertBillingProfile,
  validateBillingProfile,
} from "../lib/billingProfile";

const router = Router();

const razorpayKeyId = process.env.RAZORPAY_KEY_ID;
const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET;
const razorpayAnnualPlanId = process.env.RAZORPAY_PLAN_ID_ANNUAL; // legacy Growth fallback
const razorpayWebhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
const isRazorpayConfigured =
  !!razorpayKeyId &&
  !!razorpayKeySecret &&
  razorpayKeyId !== "rzp_test_YourKeyIdHere" &&
  razorpayKeySecret !== "YourSecretHere";

const razorpay = isRazorpayConfigured
  ? new Razorpay({ key_id: razorpayKeyId, key_secret: razorpayKeySecret })
  : null;

const MAX_ADDON_BLOCKS = 20;

const timingSafeEqualHex = (left: string, right: string) => {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

/** Resolve which Razorpay plan id backs an autopay product. */
const getRazorpayPlanIdFor = async (plan: PaidPlan | "storage_addon"): Promise<string | null> => {
  const row = await getPlanById(plan);
  if (row?.razorpayPlanId) return row.razorpayPlanId;
  if (plan === "growth" && razorpayAnnualPlanId) return razorpayAnnualPlanId;
  const envValue = process.env[`RAZORPAY_PLAN_ID_${plan.toUpperCase()}`];
  return envValue || null;
};

/** Razorpay Autopay is only live after the customer authenticates the mandate in Checkout. */
async function fetchRazorpaySubscriptionStatus(subscriptionId: string | null | undefined): Promise<string | null> {
  if (!razorpay || !subscriptionId || subscriptionId.startsWith("mock_")) return null;
  try {
    const sub: any = await razorpay.subscriptions.fetch(subscriptionId);
    return typeof sub?.status === "string" ? sub.status : null;
  } catch (err) {
    logger.warn({ err, subscriptionId }, "Could not fetch Razorpay subscription status");
    return null;
  }
}

/**
 * Delayed Autopay start for coupon first-invoice:
 * charge coupon amount NOW via order; Razorpay Plan amount only at period end.
 * Never allow a near-term start_at (that caused same-day full-price charges).
 */
function bootstrapAutopayStartAt(plan: PaidPlan, expiresAt: Date): number {
  const periodEnd = planTermEnd(plan, new Date()) || expiresAt;
  const targetMs = Math.max(periodEnd.getTime(), expiresAt.getTime());
  const minDelayMs =
    planBillingPeriod(plan) === "monthly"
      ? 28 * 24 * 60 * 60 * 1000
      : 360 * 24 * 60 * 60 * 1000;
  const minStartMs = Date.now() + minDelayMs;
  return Math.floor(Math.max(targetMs, minStartMs) / 1000);
}

/**
 * After a discounted first invoice (order), create a delayed Razorpay subscription
 * that charges the full plan price at the end of the paid period.
 * The customer must still authorize the mandate via Checkout (needsMandateSetup).
 */
async function scheduleBootstrapAutopay(opts: {
  userId: string;
  plan: PaidPlan;
  expiresAt: Date | null;
  paymentRowId: string;
  orderId: string;
  couponCode?: string | null;
  existingSubscriptionId?: string | null;
}): Promise<{ subscriptionId: string; planId: string } | null> {
  if (!razorpay || !opts.expiresAt || !SUBSCRIPTION_PLANS.includes(opts.plan)) return null;

  if (opts.existingSubscriptionId) {
    const status = await fetchRazorpaySubscriptionStatus(opts.existingSubscriptionId);
    if (status && status !== "cancelled" && status !== "completed" && status !== "expired") {
      const planId = (await getRazorpayPlanIdFor(opts.plan)) || "";
      return { subscriptionId: opts.existingSubscriptionId, planId };
    }
  }

  const planId = (await getRazorpayPlanIdFor(opts.plan)) || null;
  if (!planId) return null;

  const startAt = bootstrapAutopayStartAt(opts.plan, opts.expiresAt);
  const totalCount = planBillingPeriod(opts.plan) === "monthly" ? 100 : 10;
  const subscription: any = await razorpay.subscriptions.create({
    plan_id: planId,
    total_count: totalCount,
    quantity: 1,
    customer_notify: 1,
    start_at: startAt,
    notes: {
      userId: opts.userId,
      plan: opts.plan,
      coupon: opts.couponCode || "",
      bootstrapFromOrder: opts.orderId,
      mode: "subscription_bootstrap",
      firstInvoice: "coupon_order",
      renewalPaise: "plan_list_price",
    },
  } as any);

  await db
    .update(payments)
    .set({ razorpaySubscriptionId: subscription.id })
    .where(eq(payments.id, opts.paymentRowId));

  logger.info(
    {
      userId: opts.userId,
      plan: opts.plan,
      subscriptionId: subscription.id,
      startAt,
      startAtIso: new Date(startAt * 1000).toISOString(),
    },
    "Scheduled delayed Autopay after coupon first invoice",
  );

  return { subscriptionId: subscription.id as string, planId };
}

const parsePlanParam = (value: unknown): PaidPlan | null => {
  const normalized = normalizePlanId(typeof value === "string" ? value : null);
  return normalized && normalized !== "free" ? (normalized as PaidPlan) : null;
};

const PLAN_RANK: Record<string, number> = {
  identity: 1,
  essential: 2,
  studentplus: 2,
  growth: 3,
};

const isUpgradeTo = (state: Awaited<ReturnType<typeof resolveSubscriptionState>>, plan: PaidPlan) => {
  if (!state.isPremium || !state.plan || state.plan === plan) return false;
  const currentRank = PLAN_RANK[state.plan] || 0;
  const nextRank = PLAN_RANK[plan] || 0;
  return nextRank > currentRank;
};

const assertCanPurchase = (state: Awaited<ReturnType<typeof resolveSubscriptionState>>, plan: PaidPlan) => {
  if (!state.isPremium) return null;

  if (state.plan === plan) {
    return planBillingPeriod(plan) === "lifetime"
      ? "This plan is already active on this account."
      : "This plan is already active — renewals happen automatically.";
  }

  // Allow upgrades to a higher-ranked plan while premium.
  if (isUpgradeTo(state, plan)) return null;

  return "Downgrades are not available mid-cycle. Cancel auto-renew and switch after your current period ends, or upgrade to a higher plan.";
};

/** After a successful upgrade, stop the previous Razorpay autopay immediately. */
async function cancelPreviousRazorpaySubscription(
  userId: string,
  previousSubscriptionId: string | null | undefined,
  newSubscriptionId: string | null | undefined,
) {
  if (!previousSubscriptionId || previousSubscriptionId.startsWith("mock_")) return;
  if (newSubscriptionId && previousSubscriptionId === newSubscriptionId) return;
  if (!razorpay) return;
  try {
    await razorpay.subscriptions.cancel(previousSubscriptionId, false /* cancel now */);
    logger.info({ userId, previousSubscriptionId, newSubscriptionId }, "Cancelled previous Razorpay subscription after upgrade");
  } catch (err) {
    logger.warn({ err, userId, previousSubscriptionId }, "Failed to cancel previous Razorpay subscription after upgrade");
  }
}

const sendBillingReceipts = async (userId: string, plan: string, amountPaid: number, reference: string) => {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return;

  if (user.email) {
    try {
      await sendBillingEmail(user.email, user.name || "User", plan, amountPaid, reference, userId);
    } catch (err) {
      logger.error({ err, userId }, "Billing email enqueue failed");
    }
  } else {
    logger.warn({ userId, reference }, "Billing receipt skipped: user has no email on file");
  }

  if (user.phone) {
    sendBillingWhatsApp(user.phone, user.name || "User", plan, amountPaid).catch((err) =>
      logger.error({ err, userId }, "Background billing WhatsApp failed"),
    );
  }
};

router.get("/status", requireAuth, async (req: any, res: any) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  try {
    const access = await resolveSiteAccess(userId);
    const state = access.subscription;
    const limits = await getPlanLimits(state.isPremium ? state.plan : "free");
    const [statusUser] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    const updatesUsage = statusUser ? await getUpdatesUsage(statusUser, limits.updatesPerMonth) : null;
    const parsesUsage = statusUser ? await getParsesUsage(statusUser, limits.parsesPerMonth) : null;
    const history = await db
      .select()
      .from(payments)
      .where(eq(payments.userId, userId))
      .orderBy(desc(payments.createdAt));

    // Fill missing invoices in the background; the next load picks them up.
    if (history.some((p) => p.status === "success" && !p.invoiceUrl && p.amount > 0)) {
      backfillMissingInvoices(userId).catch(() => undefined);
    }

    const latestPayment = history[0];
    const catalog = await loadPricingCatalog();
    const storageAddon = await getStorageAddonControl(userId);
    const rzpSubId = state.subscription?.razorpaySubscriptionId || null;
    const rzpStatus = await fetchRazorpaySubscriptionStatus(rzpSubId);
    const autopayLive = !!rzpSubId && (rzpSubId.startsWith("mock_") || isMandateReadyStatus(rzpStatus));

    const [heldMandate] = await db
      .select()
      .from(payments)
      .where(and(eq(payments.userId, userId), eq(payments.status, "awaiting_mandate")))
      .orderBy(desc(payments.createdAt))
      .limit(1);

    const needsMandateSetup =
      !!heldMandate ||
      (!!rzpSubId && !rzpSubId.startsWith("mock_") && rzpStatus === "created" && !state.isPremium);

    res.json({
      plan: state.plan,
      status: state.status,
      isPremium: state.isPremium,
      expiresAt: state.expiresAt,
      billingPeriod: state.billingPeriod,
      storageQuotaBytes: state.storageQuotaBytes,
      storageBonusBytes: state.storageBonusBytes,
      effectiveQuotaBytes: state.storageQuotaBytes,
      storageUsedBytes: access.storageUsedBytes,
      overStorage: access.overStorage,
      siteStatus: access.siteStatus,
      pauseReason: access.pauseReason,
      graceUntil: access.graceUntil,
      cancelAtPeriodEnd: access.cancelAtPeriodEnd,
      paymentFailedAt: access.paymentFailedAt,
      isInPaymentGrace: access.isInPaymentGrace,
      isPausedForVisitors: access.isPausedForVisitors,
      addonBlocks: state.addonBlocks,
      addonBytes: state.addonBytes,
      addonHasAutopay: storageAddon.hasAutopay,
      addon: state.addon
        ? {
            blocks: state.addonBlocks,
            rowBlocks: state.addon.blocks,
            status: state.addon.status,
            currentEnd: state.addon.currentEnd,
            hasAutopay: storageAddon.hasAutopay,
            grantingBlocks: storageAddon.grantingBlocks,
            autopay: storageAddon.hasAutopay,
          }
        : storageAddon.grantingBlocks > 0
          ? {
              blocks: storageAddon.grantingBlocks,
              status: "cancelled",
              currentEnd: null,
              hasAutopay: false,
              grantingBlocks: storageAddon.grantingBlocks,
              autopay: false,
            }
          : null,
      limits: {
        parsesPerMonth: limits.parsesPerMonth,
        updatesPerMonth: limits.updatesPerMonth,
        updatesUsed: updatesUsage?.used ?? 0,
        updatesRemaining: updatesUsage?.remaining ?? limits.updatesPerMonth,
        updatesDaysToReset: updatesUsage?.daysToReset ?? 30,
        parsesUsed: parsesUsage?.used ?? 0,
        parsesRemaining: parsesUsage?.remaining ?? limits.parsesPerMonth,
        parsesDaysToReset: parsesUsage?.daysToReset ?? 30,
      },
      canBuy: state.canBuy,
      renewalMode: state.renewalMode,
      autopay: autopayLive,
      needsMandateSetup,
      razorpayKey: needsMandateSetup ? razorpayKeyId : undefined,
      pendingCheckout: heldMandate
        ? {
            paymentId: heldMandate.id,
            plan: heldMandate.plan,
            amount: heldMandate.amount,
            subscriptionId: heldMandate.razorpaySubscriptionId,
            status: heldMandate.status,
          }
        : null,
      subscription: state.subscription
        ? {
            plan: normalizePlanId(state.subscription.plan) || state.subscription.plan,
            status: state.subscription.status,
            expiresAt: state.subscription.expiresAt,
            createdAt: state.subscription.createdAt,
            autopay: autopayLive,
            razorpayStatus: rzpStatus,
            razorpaySubscriptionId: heldMandate?.razorpaySubscriptionId || rzpSubId,
            needsMandateSetup,
            cancelAtPeriodEnd: access.cancelAtPeriodEnd,
          }
        : heldMandate
          ? {
              plan: heldMandate.plan,
              status: "awaiting_mandate",
              expiresAt: null,
              createdAt: heldMandate.createdAt,
              autopay: false,
              razorpaySubscriptionId: heldMandate.razorpaySubscriptionId,
              needsMandateSetup: true,
              cancelAtPeriodEnd: false,
            }
          : null,
      latestPayment: latestPayment
        ? {
            amount: latestPayment.amount,
            status: latestPayment.status,
            invoiceUrl: latestPayment.invoiceUrl,
            createdAt: latestPayment.createdAt,
          }
        : null,
      payments: history.map((p) => ({
        id: p.id,
        plan: p.plan,
        kind: p.kind,
        amount: p.amount,
        status: p.status,
        invoiceUrl: p.invoiceUrl,
        razorpayOrderId: p.razorpayOrderId,
        razorpaySubscriptionId: p.razorpaySubscriptionId,
        razorpayPaymentId: p.razorpayPaymentId,
        createdAt: p.createdAt,
      })),
      pricing: await toPublicPricingPayload(catalog),
      billingProfile: toPublicBillingProfile(await getBillingProfile(userId)),
    });
  } catch (error) {
    logger.error({ error, userId }, "Failed to load billing status");
    res.status(500).json({ error: "Unable to load billing status right now." });
  }
});

router.get("/billing-profile", requireAuth, async (req: any, res: any) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  try {
    const profile = await getBillingProfile(userId);
    res.json({ billingProfile: toPublicBillingProfile(profile) });
  } catch (error) {
    logger.error({ error, userId }, "Failed to load billing profile");
    res.status(500).json({ error: "Unable to load billing information right now." });
  }
});

router.put("/billing-profile", requireAuth, async (req: any, res: any) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  try {
    const validated = validateBillingProfile(req.body?.billing || req.body);
    if (!validated.ok) {
      return res.status(400).json({ error: validated.error, code: "BILLING_INVALID" });
    }
    const profile = await upsertBillingProfile(userId, validated.value);
    res.json({ billingProfile: toPublicBillingProfile(profile) });
  } catch (error) {
    logger.error({ error, userId }, "Failed to save billing profile");
    res.status(500).json({ error: "Unable to save billing information right now." });
  }
});

// One-time orders: Student+ (lifetime), plus fallback for autopay plans whose
// Razorpay plan is not configured yet.
router.post("/create-order", requireAuth, async (req: any, res: any) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const plan = parsePlanParam(req.body?.plan);
  const couponCode = typeof req.body?.couponCode === "string" ? req.body.couponCode : undefined;
  if (!plan) {
    return res.status(400).json({ error: "Choose a valid plan." });
  }

  try {
    const billingGate = await ensureBillingProfileForCheckout(userId, req.body?.billing);
    if (!billingGate.ok) {
      return res.status(400).json({ error: billingGate.error, code: billingGate.code });
    }

    const current = await resolveSubscriptionState(userId);
    const blocked = assertCanPurchase(current, plan);
    if (blocked) {
      return res.status(409).json({ error: blocked, canBuy: current.canBuy, renewalMode: current.renewalMode });
    }

    // Identity / Essential / Growth must use subscription (or subscription_bootstrap)
    // checkout. One-time create-order is only for Student+ and legacy fallbacks
    // that are explicitly not autopay plans.
    if (SUBSCRIPTION_PLANS.includes(plan)) {
      return res.status(409).json({
        error: "This plan is an auto-renewing subscription. Use subscription checkout instead.",
        code: "USE_SUBSCRIPTION",
        canBuy: current.canBuy,
        renewalMode: current.renewalMode,
      });
    }

    // If a coupon or order checkout fallback is used, calculate plan amount directly
    const pricing = await calculatePlanAmount(plan, couponCode);
    const amountInPaise = pricing.totalPaise;
    const orderOptions = {
      amount: amountInPaise,
      currency: "INR",
      receipt: `bexo_${userId.slice(0, 8)}_${Date.now()}`,
      notes: {
        userId,
        plan,
        coupon: pricing.coupon || "",
      },
    };

    let order: { id: string; amount: number; currency: string };
    let mock = false;

    if (razorpay) {
      const razorpayOrder = await razorpay.orders.create(orderOptions);
      order = {
        id: razorpayOrder.id,
        amount: Number(razorpayOrder.amount),
        currency: razorpayOrder.currency,
      };
    } else if (process.env.NODE_ENV !== "production") {
      mock = true;
      order = {
        id: `mock_order_${Date.now()}`,
        amount: amountInPaise,
        currency: "INR",
      };
    } else {
      return res.status(503).json({ error: "Payments are not configured. Please contact support." });
    }

    await db.insert(payments).values({
      userId,
      razorpayOrderId: order.id,
      amount: amountInPaise,
      status: "pending",
      plan,
      kind: "order",
      couponCode: pricing.coupon || null,
    });

    res.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      key: razorpayKeyId,
      mock,
      pricing,
      renewalMode: current.renewalMode,
      canBuy: current.canBuy,
    });
  } catch (error) {
    logger.error({ error, userId }, "Failed to create Razorpay order");
    res.status(500).json({ error: "Unable to start checkout right now." });
  }
});

// Autopay subscription checkout for Identity / Essential (monthly) and Growth (yearly).
router.post("/create-subscription", requireAuth, async (req: any, res: any) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const couponCode = typeof req.body?.couponCode === "string" ? req.body.couponCode : undefined;
  // Legacy clients did not pass a plan (implied annual/growth).
  const plan = parsePlanParam(req.body?.plan) ?? "growth";

  if (!SUBSCRIPTION_PLANS.includes(plan)) {
    return res.status(400).json({
      error: "This plan is a one-time purchase. Use the regular checkout.",
      code: "USE_ORDER",
    });
  }

  try {
    const billingGate = await ensureBillingProfileForCheckout(userId, req.body?.billing);
    if (!billingGate.ok) {
      return res.status(400).json({ error: billingGate.error, code: billingGate.code });
    }

    const current = await resolveSubscriptionState(userId);
    const blocked = assertCanPurchase(current, plan);
    if (blocked) {
      return res.status(409).json({ error: blocked, canBuy: current.canBuy, renewalMode: current.renewalMode });
    }
    const upgrading = isUpgradeTo(current, plan);
    // Same-plan autopay already running — no new subscription needed.
    // Upgrades are allowed and will replace the Razorpay subscription on verify.
    if (current.subscription?.razorpaySubscriptionId && current.isPremium && !upgrading) {
      return res.status(409).json({
        error: "Auto-renew is already on for your plan — no new subscription needed.",
        code: "SUBSCRIPTION_ACTIVE",
        renewalMode: current.renewalMode,
      });
    }

    const quote = await buildCheckoutQuote(plan, couponCode);
    const listPricing = quote.list;
    const firstPricing = quote.first;
    const amountInPaise = firstPricing.totalPaise; // due today (may be discounted)
    const fullPlanPaise = listPricing.totalPaise; // Razorpay Plan amount / renewals

    if (couponCode) {
      const couponRow = await findActiveCoupon(couponCode);
      if (!couponRow) {
        return res.status(400).json({ error: "This coupon is invalid or expired." });
      }
      if (await hasUserRedeemedCoupon(userId, couponRow.id)) {
        return res.status(409).json({
          error: "You have already used this coupon on this account.",
          code: "COUPON_ALREADY_USED",
        });
      }
    }

    if (razorpay) {
      const rzpPlanId = await getRazorpayPlanIdFor(plan);
      if (!rzpPlanId) {
        return res.status(503).json({
          error: "Autopay is not configured for this plan yet. Please try again later or contact support.",
        });
      }

      // Guard against catalog drift vs Razorpay Plan (always compare FULL list price).
      // Invalid plan IDs (e.g. leftover test-mode IDs after switching to live keys)
      // must fail loudly — otherwise subscriptions.create returns a generic 500.
      try {
        const rzpPlan: any = await razorpay.plans.fetch(rzpPlanId);
        const planAmount = Number(rzpPlan?.item?.amount);
        if (Number.isFinite(planAmount) && planAmount !== fullPlanPaise) {
          logger.error({ planAmount, fullPlanPaise, rzpPlanId, plan }, "Razorpay plan amount mismatch with catalog pricing");
          return res.status(409).json({
            error: "Pricing is being updated. Please try again in a few minutes or contact support.",
            code: "PLAN_AMOUNT_MISMATCH",
          });
        }
      } catch (planErr) {
        logger.error({ planErr, rzpPlanId, plan }, "Razorpay plan id is invalid or inaccessible for current API keys");
        return res.status(503).json({
          error: "Autopay is not configured for this plan yet. Please try again later or contact support.",
          code: "RAZORPAY_PLAN_INVALID",
        });
      }

      const planRow = await getPlanById(plan);
      void planRow; // reserved for future display metadata on bootstrap receipts
      // Coupon / discounted first invoice: ALWAYS charge coupon via order now,
      // then Autopay full list price next cycle. Do not use Razorpay Offers or
      // an immediate subscription charge (that double-billed testers).
      if (firstPricing.totalPaise < fullPlanPaise) {
        logger.info(
          { plan, couponCode, firstPaise: amountInPaise, renewalPaise: fullPlanPaise },
          "Discounted first invoice — subscription_bootstrap (coupon now, full price next cycle)",
        );

        const orderOptions = {
          amount: amountInPaise,
          currency: "INR",
          receipt: `bexo_boot_${userId.slice(0, 8)}_${Date.now()}`.slice(0, 40),
          notes: {
            userId,
            plan,
            coupon: firstPricing.coupon || "",
            mode: "subscription_bootstrap",
            renewalPaise: String(fullPlanPaise),
            upgradeFrom: upgrading && current.plan ? current.plan : "",
            previousSubscriptionId: upgrading ? current.subscription?.razorpaySubscriptionId || "" : "",
          },
        };
        const razorpayOrder = await razorpay.orders.create(orderOptions);
        await db.insert(payments).values({
          userId,
          razorpayOrderId: razorpayOrder.id,
          amount: Number(razorpayOrder.amount),
          status: "pending",
          plan,
          kind: "subscription_bootstrap",
          couponCode: firstPricing.coupon || null,
        });

        return res.json({
          mode: "subscription_bootstrap",
          orderId: razorpayOrder.id,
          amount: Number(razorpayOrder.amount),
          currency: razorpayOrder.currency || "INR",
          key: razorpayKeyId,
          mock: false,
          pricing: firstPricing,
          list: listPricing,
          first: firstPricing,
          discountApplies: quote.discountApplies,
          renewalLabel: quote.renewalLabel,
          message: quote.message,
          offerApplied: false,
          plan,
          renewalMode: current.renewalMode,
          canBuy: current.canBuy,
        });
      }

      // Full-price Autopay (no coupon): charge plan amount on first subscription invoice.
      const totalCount = planBillingPeriod(plan) === "monthly" ? 100 : 10;
      const subscriptionPayload: Record<string, unknown> = {
        plan_id: rzpPlanId,
        total_count: totalCount,
        quantity: 1,
        customer_notify: 1,
        notes: {
          userId,
          plan,
          coupon: "",
          upgradeFrom: upgrading && current.plan ? current.plan : "",
          previousSubscriptionId: upgrading ? current.subscription?.razorpaySubscriptionId || "" : "",
          firstInvoicePaise: String(fullPlanPaise),
          renewalPaise: String(fullPlanPaise),
        },
      };

      const subscription: any = await razorpay.subscriptions.create(subscriptionPayload as any);

      await db.insert(payments).values({
        userId,
        razorpaySubscriptionId: subscription.id,
        amount: fullPlanPaise,
        status: "pending",
        plan,
        kind: "subscription",
        couponCode: null,
      });

      return res.json({
        subscriptionId: subscription.id,
        amount: fullPlanPaise,
        currency: "INR",
        key: razorpayKeyId,
        mock: false,
        pricing: listPricing,
        list: listPricing,
        first: listPricing,
        discountApplies: quote.discountApplies,
        renewalLabel: quote.renewalLabel,
        message: quote.message,
        offerApplied: false,
        plan,
        renewalMode: current.renewalMode,
        canBuy: current.canBuy,
      });
    }

    if (process.env.NODE_ENV !== "production") {
      const mockId = `mock_sub_${Date.now()}`;
      await db.insert(payments).values({
        userId,
        razorpaySubscriptionId: mockId,
        amount: amountInPaise,
        status: "pending",
        plan,
        kind: "subscription",
        couponCode: firstPricing.coupon || null,
      });
      return res.json({
        subscriptionId: mockId,
        amount: amountInPaise,
        currency: "INR",
        key: razorpayKeyId,
        mock: true,
        pricing: firstPricing,
        list: listPricing,
        first: firstPricing,
        discountApplies: quote.discountApplies,
        renewalLabel: quote.renewalLabel,
        message: quote.message,
        offerApplied: false,
        plan,
        renewalMode: current.renewalMode,
        canBuy: current.canBuy,
      });
    }

    return res.status(503).json({ error: "Payments are not configured. Please contact support." });
  } catch (error) {
    logger.error({ error, userId }, "Failed to create Razorpay subscription");
    res.status(500).json({ error: "Unable to start subscription checkout right now." });
  }
});

// Verify a Razorpay Subscription checkout (first autopay charge).
router.post("/verify-subscription", requireAuth, async (req: any, res: any) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const { razorpay_subscription_id, razorpay_payment_id, razorpay_signature } = req.body;
  if (!razorpay_subscription_id || !razorpay_payment_id) {
    return res.status(400).json({ error: "Missing subscription verification details." });
  }

  try {
    const [payment] = await db
      .select()
      .from(payments)
      .where(and(eq(payments.razorpaySubscriptionId, razorpay_subscription_id), eq(payments.userId, userId)))
      .limit(1);

    if (!payment) {
      return res.status(404).json({ error: "Subscription was not found for this account." });
    }

    const plan = (normalizePlanId(payment.plan) || "growth") as PaidPlan;

    if (payment.status === "success") {
      const state = await resolveSubscriptionState(userId);
      return res.json({
        success: true,
        message: "Payment already verified.",
        plan: state.plan,
        isPremium: state.isPremium,
        expiresAt: state.expiresAt,
        storageQuotaBytes: state.storageQuotaBytes,
        storageBonusBytes: state.storageBonusBytes,
        stacked: false,
        renewalMode: state.renewalMode,
        autopay: true,
      });
    }

    if (isRazorpayConfigured) {
      if (!razorpay_signature) {
        return res.status(400).json({ error: "Missing payment signature." });
      }
      // For subscriptions Razorpay signs `payment_id|subscription_id`.
      const hmac = crypto.createHmac("sha256", razorpayKeySecret!);
      hmac.update(`${razorpay_payment_id}|${razorpay_subscription_id}`);
      const generatedSignature = hmac.digest("hex");
      if (!timingSafeEqualHex(generatedSignature, razorpay_signature)) {
        await db.update(payments).set({ status: "failed" }).where(eq(payments.id, payment.id));
        return res.status(400).json({ error: "Invalid payment signature." });
      }
    } else if (!razorpay_subscription_id.startsWith("mock_sub_")) {
      return res.status(503).json({ error: "Payments are not configured. Please contact support." });
    }

    // Mark success before activating so retries stay idempotent.
    await db
      .update(payments)
      .set({ razorpayPaymentId: razorpay_payment_id, status: "success" })
      .where(eq(payments.id, payment.id));

    // Prefer Razorpay's own current period end for the expiry; the webhook
    // remains the source of truth for renewals.
    let expiresAt = await getRenewalExpiry(userId, plan);
    if (razorpay) {
      try {
        const sub: any = await razorpay.subscriptions.fetch(razorpay_subscription_id);
        if (sub?.current_end) {
          expiresAt = new Date(Number(sub.current_end) * 1000);
        }
      } catch (fetchErr) {
        logger.warn({ fetchErr, razorpay_subscription_id }, "Could not fetch subscription for expiry; using local term");
      }
    }

    const currentBeforeActivate = await resolveSubscriptionState(userId);
    const previousRzpId = currentBeforeActivate.subscription?.razorpaySubscriptionId || null;
    const activated = await activatePaidPlan(userId, plan, expiresAt, {
      subscriptionId: razorpay_subscription_id,
      planId: (await getRazorpayPlanIdFor(plan)) || null,
    });
    await cancelPreviousRazorpaySubscription(userId, previousRzpId, razorpay_subscription_id);
    const couponCode =
      (typeof req.body?.couponCode === "string" ? req.body.couponCode : undefined) ||
      payment.couponCode ||
      undefined;
    await recordCouponRedemption(couponCode, { userId, paymentId: payment.id });
    await generateAndStoreInvoice(payment.id);
    await sendBillingReceipts(userId, plan, payment.amount / 100, razorpay_payment_id);
    await markOnboardingComplete(userId).catch((err) =>
      logger.warn({ err, userId }, "markOnboardingComplete failed after subscription payment"),
    );

    res.json({
      success: true,
      message: "Subscription activated successfully",
      plan: activated.plan,
      isPremium: true,
      expiresAt: activated.expiresAt,
      storageQuotaBytes: activated.storageQuotaBytes,
      storageBonusBytes: activated.storageBonusBytes,
      stacked: activated.stacked,
      renewalMode: activated.renewalMode,
      autopay: true,
    });
  } catch (error) {
    logger.error({ error, userId }, "Failed to verify Razorpay subscription");
    res.status(500).json({ error: "Unable to verify subscription right now." });
  }
});

router.post("/verify", requireAuth, async (req: any, res: any) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
  if (!razorpay_order_id || !razorpay_payment_id) {
    return res.status(400).json({ error: "Missing payment verification details." });
  }

  try {
    const [payment] = await db
      .select()
      .from(payments)
      .where(and(eq(payments.razorpayOrderId, razorpay_order_id), eq(payments.userId, userId)))
      .limit(1);

    if (!payment) {
      return res.status(404).json({ error: "Payment order was not found for this account." });
    }

    // NEVER trust client-supplied plan — activate only what was quoted on the order row.
    const plan = normalizePlanId(payment.plan) as PaidPlan | null;
    const clientPlan = parsePlanParam(req.body?.plan);
    if (!plan) {
      return res.status(400).json({ error: "Payment order has no valid plan." });
    }
    if (clientPlan && clientPlan !== plan) {
      return res.status(400).json({
        error: "Plan mismatch with the original order. Refresh and try again.",
        code: "PLAN_MISMATCH",
      });
    }

    if (payment.status === "success" || payment.status === "awaiting_mandate") {
      const state = await resolveSubscriptionState(userId);
      // HARD MANDATE: first invoice held until Autopay is authorized — never silent-activate.
      if (
        (payment.status === "awaiting_mandate" || payment.kind === "subscription_bootstrap") &&
        SUBSCRIPTION_PLANS.includes(plan as PaidPlan) &&
        payment.status !== "success"
      ) {
        let subscriptionId = payment.razorpaySubscriptionId;
        const provisionalExpiry = await getRenewalExpiry(userId, plan as PaidPlan);
        const status = await fetchRazorpaySubscriptionStatus(subscriptionId);
        if (!isMandateReadyStatus(status)) {
          if (!subscriptionId || status === "cancelled" || status === "completed" || status === "expired" || !status) {
            try {
              const scheduled = await scheduleBootstrapAutopay({
                userId,
                plan: plan as PaidPlan,
                expiresAt: provisionalExpiry,
                paymentRowId: payment.id,
                orderId: razorpay_order_id,
                couponCode: payment.couponCode,
                existingSubscriptionId: subscriptionId,
              });
              if (scheduled) subscriptionId = scheduled.subscriptionId;
            } catch (subErr) {
              logger.error({ subErr, userId, orderId: razorpay_order_id }, "Failed to resume bootstrap Autopay schedule");
            }
          }
          if (subscriptionId) {
            return res.json({
              success: true,
              message: "First invoice received — authorize Autopay to activate your plan.",
              plan: null,
              isPremium: false,
              activated: false,
              expiresAt: null,
              storageQuotaBytes: state.storageQuotaBytes,
              storageBonusBytes: state.storageBonusBytes,
              stacked: false,
              renewalMode: state.renewalMode,
              autopay: false,
              bootstrap: true,
              needsMandateSetup: true,
              subscriptionId,
              key: razorpayKeyId,
            });
          }
          return res.status(409).json({
            error: "Autopay setup is incomplete. Retry checkout or contact support.",
            code: "MANDATE_REQUIRED",
            needsMandateSetup: true,
          });
        }
      }
      return res.json({
        success: true,
        message: "Payment already verified.",
        plan: state.plan,
        isPremium: state.isPremium,
        activated: state.isPremium,
        expiresAt: state.expiresAt,
        storageQuotaBytes: state.storageQuotaBytes,
        storageBonusBytes: state.storageBonusBytes,
        stacked: false,
        renewalMode: state.renewalMode,
        autopay: !!state.subscription?.razorpaySubscriptionId,
        bootstrap: payment.kind === "subscription_bootstrap",
        needsMandateSetup: false,
      });
    }

    const current = await resolveSubscriptionState(userId);
    const blocked = assertCanPurchase(current, plan);
    if (blocked) {
      return res.status(409).json({ error: blocked, canBuy: current.canBuy, renewalMode: current.renewalMode });
    }

    if (isRazorpayConfigured) {
      if (!razorpay_signature) {
        return res.status(400).json({ error: "Missing payment signature." });
      }

      const hmac = crypto.createHmac("sha256", razorpayKeySecret!);
      hmac.update(`${razorpay_order_id}|${razorpay_payment_id}`);
      const generatedSignature = hmac.digest("hex");

      if (!timingSafeEqualHex(generatedSignature, razorpay_signature)) {
        await db.update(payments).set({ status: "failed" }).where(eq(payments.id, payment.id));
        return res.status(400).json({ error: "Invalid payment signature." });
      }
    } else if (!razorpay_order_id.startsWith("mock_order_")) {
      return res.status(503).json({ error: "Payments are not configured. Please contact support." });
    }

    // Mark success before activating so retries are idempotent.
    // HARD MANDATE bootstrap: hold as awaiting_mandate — activate only after confirm-autopay.
    // Conditional update prevents double-activate races under parallel /verify calls.
    const isBootstrap = payment.kind === "subscription_bootstrap" && SUBSCRIPTION_PLANS.includes(plan);
    const [claimedPayment] = await db
      .update(payments)
      .set({
        razorpayPaymentId: razorpay_payment_id,
        status: isBootstrap ? "awaiting_mandate" : "success",
        plan,
        kind: payment.kind || "order",
      })
      .where(and(eq(payments.id, payment.id), eq(payments.status, payment.status)))
      .returning({ id: payments.id });

    if (!claimedPayment) {
      const state = await resolveSubscriptionState(userId);
      return res.json({
        success: true,
        message: "Payment already verified.",
        plan: state.plan,
        isPremium: state.isPremium,
        activated: state.isPremium,
        expiresAt: state.expiresAt,
        storageQuotaBytes: state.storageQuotaBytes,
        storageBonusBytes: state.storageBonusBytes,
        stacked: false,
        renewalMode: state.renewalMode,
        autopay: !!state.subscription?.razorpaySubscriptionId,
        bootstrap: payment.kind === "subscription_bootstrap",
        needsMandateSetup: false,
      });
    }

    const previousRzpId = current.subscription?.razorpaySubscriptionId || null;
    const expiresAt = await getRenewalExpiry(userId, plan);

    if (isBootstrap) {
      let subscriptionIdForLink: string | null = null;
      let planIdForLink: string | null = null;
      try {
        const scheduled = await scheduleBootstrapAutopay({
          userId,
          plan,
          expiresAt,
          paymentRowId: payment.id,
          orderId: razorpay_order_id,
          couponCode: payment.couponCode,
          existingSubscriptionId: payment.razorpaySubscriptionId,
        });
        if (scheduled) {
          subscriptionIdForLink = scheduled.subscriptionId;
          planIdForLink = scheduled.planId;
        }
      } catch (subErr) {
        logger.error(
          { subErr, userId, plan, orderId: razorpay_order_id },
          "Bootstrap invoice captured but Autopay schedule failed",
        );
      }

      await recordLedgerEvent({
        userId,
        paymentId: payment.id,
        eventType: "first_invoice_captured",
        amountPaise: payment.amount,
        plan,
        razorpayPaymentId: razorpay_payment_id,
        razorpayOrderId: razorpay_order_id,
        razorpaySubscriptionId: subscriptionIdForLink,
        idempotencyKey: `first_invoice:${payment.id}`,
        metadata: { hardMandate: true },
      });
      await recordLedgerEvent({
        userId,
        paymentId: payment.id,
        eventType: "mandate_required",
        amountPaise: 0,
        plan,
        razorpaySubscriptionId: subscriptionIdForLink,
        idempotencyKey: `mandate_required:${payment.id}`,
        metadata: { planId: planIdForLink },
      });

      if (!subscriptionIdForLink) {
        return res.status(503).json({
          error: "Payment received but Autopay could not be scheduled. Contact support — do not pay again.",
          code: "AUTOPAY_SCHEDULE_FAILED",
          paymentId: payment.id,
        });
      }

      // Do NOT activate, redeem coupon, invoice, or complete onboarding until mandate is confirmed.
      return res.json({
        success: true,
        message: "First invoice received — authorize Autopay to activate your plan.",
        plan: null,
        isPremium: false,
        activated: false,
        expiresAt: null,
        storageQuotaBytes: current.storageQuotaBytes,
        storageBonusBytes: current.storageBonusBytes,
        stacked: false,
        renewalMode: current.renewalMode,
        autopay: false,
        bootstrap: true,
        needsMandateSetup: true,
        subscriptionId: subscriptionIdForLink,
        key: razorpayKeyId,
        provisionalExpiresAt: expiresAt,
      });
    }

    const activated = await activatePaidPlan(userId, plan, expiresAt);
    await cancelPreviousRazorpaySubscription(userId, previousRzpId, null);
    const couponCode =
      (typeof req.body?.couponCode === "string" ? req.body.couponCode : undefined) ||
      payment.couponCode ||
      undefined;
    await recordCouponRedemption(couponCode, { userId, paymentId: payment.id });
    await generateAndStoreInvoice(payment.id);
    await sendBillingReceipts(userId, plan, payment.amount / 100, razorpay_payment_id);
    await markOnboardingComplete(userId).catch((err) =>
      logger.warn({ err, userId }, "markOnboardingComplete failed after payment"),
    );
    await recordLedgerEvent({
      userId,
      paymentId: payment.id,
      eventType: "plan_activated",
      amountPaise: payment.amount,
      plan,
      razorpayPaymentId: razorpay_payment_id,
      razorpayOrderId: razorpay_order_id,
      idempotencyKey: `plan_activated:${payment.id}`,
    });

    res.json({
      success: true,
      message: "Payment verified successfully",
      plan: activated.plan,
      isPremium: true,
      activated: true,
      expiresAt: activated.expiresAt,
      storageQuotaBytes: activated.storageQuotaBytes,
      storageBonusBytes: activated.storageBonusBytes,
      stacked: activated.stacked,
      renewalMode: activated.renewalMode,
      autopay: false,
      bootstrap: false,
      needsMandateSetup: false,
    });
  } catch (error) {
    logger.error({ error, userId }, "Failed to verify Razorpay payment");
    res.status(500).json({ error: "Unable to verify payment right now." });
  }
});

// After bootstrap first-invoice: customer authorizes the delayed Autopay mandate.
router.post("/confirm-autopay", requireAuth, async (req: any, res: any) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const { razorpay_subscription_id, razorpay_payment_id, razorpay_signature } = req.body || {};
  if (!razorpay_subscription_id || typeof razorpay_subscription_id !== "string") {
    return res.status(400).json({ error: "Missing subscription id for Autopay confirmation." });
  }

  try {
    const [payment] = await db
      .select()
      .from(payments)
      .where(and(eq(payments.razorpaySubscriptionId, razorpay_subscription_id), eq(payments.userId, userId)))
      .limit(1);

    if (!payment) {
      return res.status(404).json({ error: "Autopay subscription was not found for this account." });
    }

    const plan = (normalizePlanId(payment.plan) || "growth") as PaidPlan;

    // Idempotent: already fully activated
    if (payment.status === "success") {
      const state = await resolveSubscriptionState(userId);
      if (state.isPremium) {
        return res.json({
          success: true,
          message: "Autopay already authorized.",
          plan: state.plan,
          isPremium: true,
          activated: true,
          expiresAt: state.expiresAt,
          storageQuotaBytes: state.storageQuotaBytes,
          storageBonusBytes: state.storageBonusBytes,
          stacked: false,
          renewalMode: state.renewalMode,
          autopay: true,
          bootstrap: payment.kind === "subscription_bootstrap",
          needsMandateSetup: false,
        });
      }
    }

    if (payment.status === "abandoned" || payment.status === "refunded" || payment.status === "failed") {
      return res.status(409).json({
        error: "This checkout was cancelled or refunded. Start a new checkout.",
        code: "CHECKOUT_CLOSED",
      });
    }

    if (isRazorpayConfigured) {
      // Checkout still returns a signed payload for mandate auth (payment_id|subscription_id).
      if (razorpay_payment_id && razorpay_signature) {
        const hmac = crypto.createHmac("sha256", razorpayKeySecret!);
        hmac.update(`${razorpay_payment_id}|${razorpay_subscription_id}`);
        const generatedSignature = hmac.digest("hex");
        if (!timingSafeEqualHex(generatedSignature, razorpay_signature)) {
          return res.status(400).json({ error: "Invalid Autopay signature." });
        }
      }

      const status = await fetchRazorpaySubscriptionStatus(razorpay_subscription_id);
      if (!isMandateReadyStatus(status) && status !== "created") {
        return res.status(409).json({
          error: "Autopay authorization is not complete yet. Please try again.",
          code: "MANDATE_NOT_READY",
          status,
        });
      }
      // status===created can briefly race; if signature verified, treat as authorized.
      if (status === "created" && !(razorpay_payment_id && razorpay_signature)) {
        return res.status(409).json({
          error: "Complete the Autopay authorization in the Razorpay window.",
          code: "MANDATE_PENDING",
          needsMandateSetup: true,
          subscriptionId: razorpay_subscription_id,
          key: razorpayKeyId,
        });
      }
    }

    const prior = await resolveSubscriptionState(userId);
    const previousRzpId = prior.subscription?.razorpaySubscriptionId || null;
    const expiresAt = await getRenewalExpiry(userId, plan);

    await db
      .update(payments)
      .set({
        status: "success",
        razorpayPaymentId: payment.razorpayPaymentId || razorpay_payment_id || null,
      })
      .where(eq(payments.id, payment.id));

    const activated = await activatePaidPlan(userId, plan, expiresAt, {
      subscriptionId: razorpay_subscription_id,
      planId: (await getRazorpayPlanIdFor(plan)) || null,
    });
    await cancelPreviousRazorpaySubscription(userId, previousRzpId, razorpay_subscription_id);

    const couponCode =
      (typeof req.body?.couponCode === "string" ? req.body.couponCode : undefined) ||
      payment.couponCode ||
      undefined;
    await recordCouponRedemption(couponCode, { userId, paymentId: payment.id });
    await generateAndStoreInvoice(payment.id);
    if (payment.razorpayPaymentId || razorpay_payment_id) {
      await sendBillingReceipts(
        userId,
        plan,
        payment.amount / 100,
        (payment.razorpayPaymentId || razorpay_payment_id) as string,
      );
    }
    await markOnboardingComplete(userId).catch((err) =>
      logger.warn({ err, userId }, "markOnboardingComplete failed after Autopay confirm"),
    );

    await recordLedgerEvent({
      userId,
      paymentId: payment.id,
      eventType: "mandate_confirmed",
      amountPaise: 0,
      plan,
      razorpaySubscriptionId: razorpay_subscription_id,
      razorpayPaymentId: payment.razorpayPaymentId || razorpay_payment_id,
      idempotencyKey: `mandate_confirmed:${payment.id}`,
    });
    await recordLedgerEvent({
      userId,
      paymentId: payment.id,
      eventType: "plan_activated",
      amountPaise: payment.amount,
      plan,
      razorpaySubscriptionId: razorpay_subscription_id,
      razorpayPaymentId: payment.razorpayPaymentId,
      razorpayOrderId: payment.razorpayOrderId,
      idempotencyKey: `plan_activated:${payment.id}`,
      metadata: { via: "hard_mandate" },
    });

    res.json({
      success: true,
      message: "Autopay authorized. Your plan is now active.",
      plan: activated.plan,
      isPremium: true,
      activated: true,
      expiresAt: activated.expiresAt,
      storageQuotaBytes: activated.storageQuotaBytes,
      storageBonusBytes: activated.storageBonusBytes,
      stacked: activated.stacked,
      renewalMode: activated.renewalMode,
      autopay: true,
      bootstrap: payment.kind === "subscription_bootstrap",
      needsMandateSetup: false,
    });
  } catch (error) {
    logger.error({ error, userId }, "Failed to confirm Autopay mandate");
    res.status(500).json({ error: "Unable to confirm Autopay right now." });
  }
});

// HARD MANDATE: user closed Autopay window — cancel pending sub, refund first invoice, no premium.
router.post("/abandon-autopay-setup", requireAuth, async (req: any, res: any) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const subscriptionId =
    typeof req.body?.razorpay_subscription_id === "string" ? req.body.razorpay_subscription_id : null;

  try {
    const [payment] = await db
      .select()
      .from(payments)
      .where(
        and(
          eq(payments.userId, userId),
          eq(payments.kind, "subscription_bootstrap"),
          eq(payments.status, "awaiting_mandate"),
        ),
      )
      .orderBy(desc(payments.createdAt))
      .limit(1);

    const linkedId = subscriptionId || payment?.razorpaySubscriptionId || null;
    if (linkedId && razorpay && !linkedId.startsWith("mock_")) {
      try {
        await razorpay.subscriptions.cancel(linkedId, false);
      } catch (err) {
        logger.warn({ err, linkedId }, "Failed to cancel unauthenticated bootstrap subscription");
      }
    }

    let refundId: string | null = null;
    if (payment?.razorpayPaymentId && razorpay && payment.amount > 0) {
      try {
        const refund: any = await razorpay.payments.refund(payment.razorpayPaymentId, {
          amount: payment.amount,
          notes: { reason: "autopay_mandate_abandoned", userId },
        } as any);
        refundId = refund?.id || null;
      } catch (err) {
        logger.error({ err, paymentId: payment.id }, "Refund after mandate abandon failed — flagging abandoned");
      }
    }

    if (payment) {
      await db
        .update(payments)
        .set({ status: refundId ? "refunded" : "abandoned" })
        .where(eq(payments.id, payment.id));
      await recordLedgerEvent({
        userId,
        paymentId: payment.id,
        eventType: refundId ? "payment_refunded" : "mandate_abandoned",
        amountPaise: payment.amount,
        plan: payment.plan,
        razorpayPaymentId: payment.razorpayPaymentId,
        razorpayOrderId: payment.razorpayOrderId,
        razorpaySubscriptionId: linkedId,
        razorpayRefundId: refundId,
        idempotencyKey: `abandon:${payment.id}`,
        metadata: { hardMandate: true },
      });
      if (refundId) {
        try {
          const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
          if (user?.email) {
            await sendRefundEmail({
              email: user.email,
              userName: user.name || "there",
              plan: payment.plan || "plan",
              amountInr: payment.amount / 100,
              refundId,
              userId,
              reason: "autopay_mandate_abandoned",
            });
          }
        } catch (mailErr) {
          logger.warn({ mailErr, userId }, "Abandon refund email failed (non-fatal)");
        }
      }
    }

    const refreshed = await resolveSubscriptionState(userId);
    res.json({
      success: true,
      message: refundId
        ? "Autopay was not authorized. Your first invoice has been refunded — plan was not activated."
        : "Autopay was not authorized. Plan was not activated. Contact support if a charge remains.",
      plan: refreshed.plan,
      isPremium: refreshed.isPremium,
      activated: false,
      expiresAt: refreshed.expiresAt,
      storageQuotaBytes: refreshed.storageQuotaBytes,
      storageBonusBytes: refreshed.storageBonusBytes,
      autopay: false,
      needsMandateSetup: false,
      refunded: !!refundId,
    });
  } catch (error) {
    logger.error({ error, userId }, "Failed to abandon Autopay setup");
    res.status(500).json({ error: "Unable to update Autopay setup right now." });
  }
});

// Resume Autopay authorization for an awaiting_mandate checkout (hard mandate).
router.post("/resume-autopay-setup", requireAuth, async (req: any, res: any) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  try {
    const [held] = await db
      .select()
      .from(payments)
      .where(
        and(
          eq(payments.userId, userId),
          eq(payments.kind, "subscription_bootstrap"),
          eq(payments.status, "awaiting_mandate"),
        ),
      )
      .orderBy(desc(payments.createdAt))
      .limit(1);

    if (held) {
      const plan = (normalizePlanId(held.plan) || "essential") as PaidPlan;
      let subscriptionId = held.razorpaySubscriptionId;
      const status = await fetchRazorpaySubscriptionStatus(subscriptionId);
      if (!subscriptionId || status === "cancelled" || status === "completed" || status === "expired" || !status) {
        const expiresAt = await getRenewalExpiry(userId, plan);
        const scheduled = await scheduleBootstrapAutopay({
          userId,
          plan,
          expiresAt,
          paymentRowId: held.id,
          orderId: held.razorpayOrderId || `resume_${userId.slice(0, 8)}`,
          couponCode: held.couponCode,
          existingSubscriptionId: subscriptionId,
        });
        subscriptionId = scheduled?.subscriptionId || null;
      }
      if (!subscriptionId) {
        return res.status(503).json({ error: "Unable to resume Autopay setup right now." });
      }
      return res.json({
        success: true,
        needsMandateSetup: true,
        subscriptionId,
        key: razorpayKeyId,
        plan,
        activated: false,
        isPremium: false,
        message: "Authorize Autopay to activate your plan.",
      });
    }

    const state = await resolveSubscriptionState(userId);
    if (!state.isPremium || !state.plan || !SUBSCRIPTION_PLANS.includes(state.plan as PaidPlan)) {
      return res.status(409).json({
        error: "No pending Autopay checkout found. Start checkout again.",
        code: "NO_PENDING_MANDATE",
      });
    }
    if (state.subscription?.razorpaySubscriptionId) {
      const status = await fetchRazorpaySubscriptionStatus(state.subscription.razorpaySubscriptionId);
      if (isMandateReadyStatus(status)) {
        return res.json({
          success: true,
          autopay: true,
          needsMandateSetup: false,
          message: "Autopay is already active.",
        });
      }
      if (status === "created") {
        return res.json({
          success: true,
          needsMandateSetup: true,
          subscriptionId: state.subscription.razorpaySubscriptionId,
          key: razorpayKeyId,
          plan: state.plan,
          expiresAt: state.expiresAt,
        });
      }
    }

    return res.status(409).json({
      error: "No Autopay setup to resume. Start a new checkout if needed.",
      code: "NO_PENDING_MANDATE",
    });
  } catch (error) {
    logger.error({ error, userId }, "Failed to resume Autopay setup");
    res.status(500).json({ error: "Unable to start Autopay setup right now." });
  }
});
// ---------------------------------------------------------------------------
// Storage add-on: ₹25 / 50MB block
// - First purchase → new Razorpay subscription
// - Add more → charge for extra blocks + merge into the existing add-on (one pool)
// ---------------------------------------------------------------------------
router.post("/create-addon-subscription", requireAuth, async (req: any, res: any) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const addBlocks = Math.floor(Number(req.body?.blocks) || 1);
  if (!Number.isFinite(addBlocks) || addBlocks < 1 || addBlocks > MAX_ADDON_BLOCKS) {
    return res.status(400).json({ error: `Choose between 1 and ${MAX_ADDON_BLOCKS} storage blocks.` });
  }

  try {
    const billingGate = await ensureBillingProfileForCheckout(userId, req.body?.billing);
    if (!billingGate.ok) {
      return res.status(400).json({ error: billingGate.error, code: billingGate.code });
    }

    const current = await resolveSubscriptionState(userId);
    if (!current.isPremium) {
      return res.status(409).json({
        error: "The storage add-on requires an active paid plan. Upgrade first, then add storage.",
        code: "PLAN_REQUIRED",
      });
    }

    const { totalBlocks } = await getGrantingAddons(userId);
    // Only merge into a still-billed add-on. Cancelled-but-granting rows keep space
    // until period end; extra blocks need a fresh Razorpay subscription.
    const control = await getStorageAddonControl(userId);
    const mergeTarget = control.primaryAutopay;
    const remainingSlots = MAX_ADDON_BLOCKS - totalBlocks;
    if (remainingSlots <= 0) {
      return res.status(409).json({
        error: `You've reached the maximum of ${MAX_ADDON_BLOCKS} storage blocks (1GB).`,
        code: "ADDON_CAP",
        addonBlocks: totalBlocks,
      });
    }
    if (addBlocks > remainingSlots) {
      return res.status(400).json({
        error: `You can add up to ${remainingSlots} more block${remainingSlots === 1 ? "" : "s"} right now.`,
        code: "ADDON_REMAINING",
        remainingSlots,
        addonBlocks: totalBlocks,
      });
    }

    const targetBlocks = totalBlocks + addBlocks;
    const pricing = await calculatePlanAmount("storage_addon", undefined, addBlocks);
    const amountInPaise = pricing.totalPaise;

    // —— INCREASE existing add-on (merge into one storage pool) ——
    if (mergeTarget) {
      const linkedSubId = mergeTarget.razorpaySubscriptionId;
      if (razorpay) {
        const order: any = await razorpay.orders.create({
          amount: amountInPaise,
          currency: "INR",
          receipt: `addon_inc_${userId.slice(0, 8)}_${Date.now()}`.slice(0, 40),
          notes: {
            userId,
            plan: "storage_addon",
            kind: "addon_increase",
            addonId: mergeTarget.id,
            addBlocks: String(addBlocks),
            targetBlocks: String(targetBlocks),
            previousBlocks: String(totalBlocks),
          },
        });

        await db.insert(payments).values({
          userId,
          razorpayOrderId: order.id,
          razorpaySubscriptionId: linkedSubId || null,
          amount: amountInPaise,
          status: "pending",
          plan: "storage_addon",
          kind: "addon_increase",
        });

        return res.json({
          mode: "increase",
          orderId: order.id,
          amount: amountInPaise,
          currency: "INR",
          key: razorpayKeyId,
          mock: false,
          pricing,
          addBlocks,
          previousBlocks: totalBlocks,
          targetBlocks,
          addonId: mergeTarget.id,
        });
      }

      // Dev / mock: merge instantly without Razorpay.
      if (process.env.NODE_ENV !== "production" || !razorpay) {
        const mockOrderId = `mock_order_addon_inc_${Date.now()}`;
        await db.insert(payments).values({
          userId,
          razorpayOrderId: mockOrderId,
          razorpaySubscriptionId: mergeTarget.razorpaySubscriptionId,
          amount: amountInPaise,
          status: "pending",
          plan: "storage_addon",
          kind: "addon_increase",
        });
        return res.json({
          mode: "increase",
          orderId: mockOrderId,
          amount: amountInPaise,
          currency: "INR",
          key: razorpayKeyId,
          mock: true,
          pricing,
          addBlocks,
          previousBlocks: totalBlocks,
          targetBlocks,
          addonId: mergeTarget.id,
        });
      }
    }

    // —— FIRST add-on (or no active primary): create a new subscription ——
    if (razorpay) {
      const rzpPlanId = await getRazorpayPlanIdFor("storage_addon");
      if (!rzpPlanId) {
        return res.status(503).json({ error: "The storage add-on is not configured yet. Please contact support." });
      }

      const subscription: any = await razorpay.subscriptions.create({
        plan_id: rzpPlanId,
        total_count: 100,
        quantity: addBlocks,
        customer_notify: 1,
        notes: {
          userId,
          plan: "storage_addon",
          blocks: String(addBlocks),
          kind: "addon_create",
        },
      } as any);

      await db.insert(addonSubscriptions).values({
        userId,
        addon: "storage",
        blocks: addBlocks,
        razorpaySubscriptionId: subscription.id,
        razorpayPlanId: rzpPlanId,
        status: "pending",
      });
      await db.insert(payments).values({
        userId,
        razorpaySubscriptionId: subscription.id,
        amount: amountInPaise,
        status: "pending",
        plan: "storage_addon",
        kind: "subscription",
      });

      return res.json({
        mode: "create",
        subscriptionId: subscription.id,
        amount: amountInPaise,
        currency: "INR",
        key: razorpayKeyId,
        mock: false,
        pricing,
        blocks: addBlocks,
        addBlocks,
        previousBlocks: totalBlocks,
        targetBlocks,
      });
    }

    if (process.env.NODE_ENV !== "production") {
      const mockId = `mock_addon_${Date.now()}`;
      await db.insert(addonSubscriptions).values({
        userId,
        addon: "storage",
        blocks: addBlocks,
        razorpaySubscriptionId: mockId,
        status: "pending",
      });
      await db.insert(payments).values({
        userId,
        razorpaySubscriptionId: mockId,
        amount: amountInPaise,
        status: "pending",
        plan: "storage_addon",
        kind: "subscription",
      });
      return res.json({
        mode: "create",
        subscriptionId: mockId,
        amount: amountInPaise,
        currency: "INR",
        key: razorpayKeyId,
        mock: true,
        pricing,
        blocks: addBlocks,
        addBlocks,
        previousBlocks: totalBlocks,
        targetBlocks,
      });
    }

    return res.status(503).json({ error: "Payments are not configured. Please contact support." });
  } catch (error) {
    logger.error({ error, userId }, "Failed to create storage add-on subscription");
    res.status(500).json({ error: "Unable to start the storage add-on checkout right now." });
  }
});

/** Merge extra blocks into the primary active add-on and align Razorpay quantity. */
async function applyAddonIncrease(opts: {
  userId: string;
  addonId: string;
  targetBlocks: number;
  addBlocks: number;
}) {
  const { userId, addonId, addBlocks } = opts;

  const [primary] = await db
    .select()
    .from(addonSubscriptions)
    .where(and(eq(addonSubscriptions.id, addonId), eq(addonSubscriptions.userId, userId)))
    .limit(1);
  if (!primary) throw new Error("Storage add-on not found");

  // Grow this subscription only (other still-paid cancelled rows keep their own grant until period end).
  const newPrimaryBlocks = Math.min(
    MAX_ADDON_BLOCKS,
    Math.max(1, Math.max(0, Number(primary.blocks) || 0) + Math.max(1, addBlocks)),
  );

  await db
    .update(addonSubscriptions)
    .set({ blocks: newPrimaryBlocks, status: "active", updatedAt: new Date() })
    .where(eq(addonSubscriptions.id, primary.id));

  // If multiple ACTIVE billed add-ons somehow exist, stop the extras (keep primary).
  const others = await db
    .select()
    .from(addonSubscriptions)
    .where(
      and(
        eq(addonSubscriptions.userId, userId),
        eq(addonSubscriptions.addon, "storage"),
        eq(addonSubscriptions.status, "active"),
      ),
    );

  for (const row of others) {
    if (row.id === primary.id) continue;
    if (razorpay && row.razorpaySubscriptionId && !row.razorpaySubscriptionId.startsWith("mock_")) {
      try {
        await razorpay.subscriptions.cancel(row.razorpaySubscriptionId, true);
      } catch (err) {
        logger.warn({ err, subscriptionId: row.razorpaySubscriptionId }, "Failed to cancel superseded storage add-on");
      }
    }
    await db
      .update(addonSubscriptions)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(addonSubscriptions.id, row.id));
  }

  if (razorpay && primary.razorpaySubscriptionId && !primary.razorpaySubscriptionId.startsWith("mock_")) {
    try {
      await razorpay.subscriptions.update(primary.razorpaySubscriptionId, {
        quantity: newPrimaryBlocks,
        schedule_change_at: "now",
      } as any);
    } catch (err) {
      logger.warn(
        { err, subscriptionId: primary.razorpaySubscriptionId, quantity: newPrimaryBlocks },
        "Razorpay storage quantity update failed; local blocks still increased",
      );
    }
  }

  const quota = await recomputeUserQuota(userId);
  const state = await resolveSubscriptionState(userId);
  return {
    quota,
    addonBlocks: state.addonBlocks,
    addedBlocks: addBlocks,
    targetBlocks: newPrimaryBlocks,
  };
}

router.post("/verify-addon-increase", requireAuth, async (req: any, res: any) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, addonId, addBlocks, targetBlocks } = req.body || {};
  if (!razorpay_order_id || !razorpay_payment_id) {
    return res.status(400).json({ error: "Missing payment verification details." });
  }

  try {
    const [payment] = await db
      .select()
      .from(payments)
      .where(and(eq(payments.razorpayOrderId, razorpay_order_id), eq(payments.userId, userId)))
      .limit(1);
    if (!payment) return res.status(404).json({ error: "Increase order was not found for this account." });
    if (payment.kind !== "addon_increase" && payment.plan !== "storage_addon") {
      return res.status(400).json({ error: "This payment is not a storage increase." });
    }

    if (payment.status === "success") {
      const state = await resolveSubscriptionState(userId);
      return res.json({
        success: true,
        message: "Already verified.",
        blocks: state.addonBlocks,
        storageQuotaBytes: state.storageQuotaBytes,
      });
    }

    let resolvedAddonId = typeof addonId === "string" ? addonId : "";
    let resolvedAdd = Math.floor(Number(addBlocks) || 0);
    let resolvedTarget = Math.floor(Number(targetBlocks) || 0);

    if (isRazorpayConfigured) {
      if (!razorpay_signature) return res.status(400).json({ error: "Missing payment signature." });
      const hmac = crypto.createHmac("sha256", razorpayKeySecret!);
      hmac.update(`${razorpay_order_id}|${razorpay_payment_id}`);
      if (!timingSafeEqualHex(hmac.digest("hex"), razorpay_signature)) {
        await db.update(payments).set({ status: "failed" }).where(eq(payments.id, payment.id));
        return res.status(400).json({ error: "Invalid payment signature." });
      }
      if (razorpay) {
        try {
          const order: any = await razorpay.orders.fetch(razorpay_order_id);
          if (order?.notes?.addonId) resolvedAddonId = String(order.notes.addonId);
          if (order?.notes?.addBlocks) resolvedAdd = Math.floor(Number(order.notes.addBlocks) || resolvedAdd);
          if (order?.notes?.targetBlocks) resolvedTarget = Math.floor(Number(order.notes.targetBlocks) || resolvedTarget);
        } catch (err) {
          logger.warn({ err, razorpay_order_id }, "Could not fetch increase order notes");
        }
      }
    } else if (!String(razorpay_order_id).startsWith("mock_order_")) {
      return res.status(503).json({ error: "Payments are not configured. Please contact support." });
    }

    if (!resolvedAddonId || resolvedAdd < 1 || resolvedTarget < 1) {
      return res.status(400).json({ error: "Missing storage increase details." });
    }

    await db
      .update(payments)
      .set({ razorpayPaymentId: razorpay_payment_id, status: "success" })
      .where(eq(payments.id, payment.id));

    const applied = await applyAddonIncrease({
      userId,
      addonId: resolvedAddonId,
      targetBlocks: resolvedTarget,
      addBlocks: resolvedAdd,
    });
    await generateAndStoreInvoice(payment.id);
    await sendBillingReceipts(userId, "storage_addon", payment.amount / 100, razorpay_payment_id);

    res.json({
      success: true,
      message: `Added +${resolvedAdd * 50}MB to your storage pool.`,
      blocks: applied.addonBlocks,
      addedBlocks: applied.addedBlocks,
      targetBlocks: applied.targetBlocks,
      storageQuotaBytes: applied.quota,
    });
  } catch (error) {
    logger.error({ error, userId }, "Failed to verify storage increase");
    res.status(500).json({ error: "Unable to verify the storage increase right now." });
  }
});

router.post("/verify-addon-subscription", requireAuth, async (req: any, res: any) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const { razorpay_subscription_id, razorpay_payment_id, razorpay_signature } = req.body;
  if (!razorpay_subscription_id || !razorpay_payment_id) {
    return res.status(400).json({ error: "Missing verification details." });
  }

  try {
    const [addonRow] = await db
      .select()
      .from(addonSubscriptions)
      .where(
        and(
          eq(addonSubscriptions.razorpaySubscriptionId, razorpay_subscription_id),
          eq(addonSubscriptions.userId, userId),
        ),
      )
      .limit(1);
    if (!addonRow) {
      return res.status(404).json({ error: "Storage add-on was not found for this account." });
    }

    if (addonRow.status === "active") {
      const quota = await recomputeUserQuota(userId);
      const state = await resolveSubscriptionState(userId);
      return res.json({
        success: true,
        message: "Already verified.",
        blocks: state.addonBlocks,
        addedBlocks: addonRow.blocks,
        storageQuotaBytes: quota,
      });
    }

    if (isRazorpayConfigured) {
      if (!razorpay_signature) {
        return res.status(400).json({ error: "Missing payment signature." });
      }
      const hmac = crypto.createHmac("sha256", razorpayKeySecret!);
      hmac.update(`${razorpay_payment_id}|${razorpay_subscription_id}`);
      if (!timingSafeEqualHex(hmac.digest("hex"), razorpay_signature)) {
        return res.status(400).json({ error: "Invalid payment signature." });
      }
    } else if (!razorpay_subscription_id.startsWith("mock_addon_")) {
      return res.status(503).json({ error: "Payments are not configured. Please contact support." });
    }

    let currentEnd: Date | null = addMonthlyTerm();
    if (razorpay) {
      try {
        const sub: any = await razorpay.subscriptions.fetch(razorpay_subscription_id);
        if (sub?.current_end) currentEnd = new Date(Number(sub.current_end) * 1000);
      } catch {
        /* fall back to local monthly term */
      }
    }

    await db
      .update(addonSubscriptions)
      .set({ status: "active", currentEnd, updatedAt: new Date() })
      .where(eq(addonSubscriptions.id, addonRow.id));

    const [paymentRow] = await db
      .select()
      .from(payments)
      .where(and(eq(payments.razorpaySubscriptionId, razorpay_subscription_id), eq(payments.userId, userId)))
      .limit(1);
    if (paymentRow && paymentRow.status !== "success") {
      await db
        .update(payments)
        .set({ razorpayPaymentId: razorpay_payment_id, status: "success" })
        .where(eq(payments.id, paymentRow.id));
      await generateAndStoreInvoice(paymentRow.id);
      await sendBillingReceipts(userId, "storage_addon", paymentRow.amount / 100, razorpay_payment_id);
    }

    const quota = await recomputeUserQuota(userId);
    const state = await resolveSubscriptionState(userId);
    res.json({
      success: true,
      message: "Storage add-on activated",
      blocks: state.addonBlocks,
      addedBlocks: addonRow.blocks,
      addonBytes: state.addonBytes,
      storageQuotaBytes: quota,
    });
  } catch (error) {
    logger.error({ error, userId }, "Failed to verify storage add-on");
    res.status(500).json({ error: "Unable to verify the storage add-on right now." });
  }
});

// Cancel base-plan autopay at cycle end. Access continues until expiresAt.
router.post("/subscription/cancel", requireAuth, async (req: any, res: any) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  try {
    const state = await resolveSubscriptionState(userId);
    if (!state.isPremium || !state.plan) {
      return res.status(400).json({ error: "No active paid subscription to cancel." });
    }
    if (planBillingPeriod(state.plan) === "lifetime") {
      return res.status(400).json({
        error: "Student+ is a one-time lifetime purchase and cannot be cancelled as a subscription.",
      });
    }

    const subId = state.subscription?.razorpaySubscriptionId;
    if (!subId) {
      // Already cancelled at Razorpay / one-time without autopay — mark local flag.
      await setCancelAtPeriodEnd(userId, true);
      return res.json({
        success: true,
        cancelAtPeriodEnd: true,
        expiresAt: state.expiresAt,
        message: "Auto-renew is already off. Your plan stays active until the paid-through date.",
      });
    }

    if (razorpay && !subId.startsWith("mock_")) {
      try {
        await razorpay.subscriptions.cancel(subId, true /* cancel_at_cycle_end */);
      } catch (err: any) {
        logger.warn({ err, subscriptionId: subId }, "Razorpay base subscription cancel failed");
        // Continue — webhook may already have cancelled; we still mark local intent.
      }
    }

    await setCancelAtPeriodEnd(userId, true);
    // Keep razorpaySubscriptionId until webhook clears it so status can show
    // "cancelling" vs already-cleared; UI uses cancelAtPeriodEnd primarily.

    try {
      const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (user?.email) {
        await sendCancellationEmail({
          email: user.email,
          userName: user.name || "there",
          plan: state.plan || "plan",
          expiresAt: state.expiresAt,
          userId,
          kind: "subscription",
        });
      }
      await recordLedgerEvent({
        userId,
        eventType: "subscription_cancelled",
        amountPaise: 0,
        plan: state.plan,
        razorpaySubscriptionId: subId || null,
        idempotencyKey: `subscription_cancelled:${userId}:${subId || "local"}:${(state.expiresAt || "").toString().slice(0, 10)}`,
        metadata: { cancelAtPeriodEnd: true, source: "user" },
      });
    } catch (mailErr) {
      logger.warn({ mailErr, userId }, "Cancellation email/ledger failed (non-fatal)");
    }

    res.json({
      success: true,
      cancelAtPeriodEnd: true,
      expiresAt: state.expiresAt,
      message: state.expiresAt
        ? `Auto-renew cancelled. You keep full access until ${new Date(state.expiresAt).toLocaleDateString()}.`
        : "Auto-renew cancelled. You keep access until the end of the current period.",
    });
  } catch (error) {
    logger.error({ error, userId }, "Failed to cancel base subscription");
    res.status(500).json({ error: "Unable to cancel your subscription right now." });
  }
});

// Cancel storage autopay: drop 1 block from a multi-block sub, or cancel entire sub at cycle end when only 1 block.
router.post("/addon/cancel", requireAuth, async (req: any, res: any) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  try {
    const control = await getStorageAddonControl(userId);
    const addonRow = control.primaryAutopay;

    if (!addonRow) {
      if (control.grantingBlocks > 0) {
        return res.status(409).json({
          error: "Storage auto-renew is already off. Your extra space stays until the paid period ends.",
          code: "ADDON_ALREADY_CANCELLED",
          addonBlocks: control.grantingBlocks,
          addonHasAutopay: false,
        });
      }
      return res.status(404).json({ error: "No storage add-on found on this account." });
    }

    const rowBlocks = Math.max(1, Number(addonRow.blocks) || 1);

    // Multi-block pool: remove one block from autopay (quota updates now; next bill matches).
    if (rowBlocks > 1) {
      const newBlocks = rowBlocks - 1;
      await db
        .update(addonSubscriptions)
        .set({ blocks: newBlocks, updatedAt: new Date() })
        .where(eq(addonSubscriptions.id, addonRow.id));

      if (razorpay && addonRow.razorpaySubscriptionId && !addonRow.razorpaySubscriptionId.startsWith("mock_")) {
        try {
          await razorpay.subscriptions.update(addonRow.razorpaySubscriptionId, {
            quantity: newBlocks,
            schedule_change_at: "now",
          } as any);
        } catch (err) {
          logger.warn({ err, subscriptionId: addonRow.razorpaySubscriptionId, quantity: newBlocks }, "Razorpay addon quantity decrease failed");
        }
      }

      const quota = await recomputeUserQuota(userId);
      const state = await resolveSubscriptionState(userId);
      return res.json({
        success: true,
        message: `Removed 1 × 50MB from auto-renew. ${newBlocks} block${newBlocks === 1 ? "" : "s"} remain.`,
        cancelledBlocks: 1,
        addonBlocks: state.addonBlocks,
        addonHasAutopay: true,
        storageQuotaBytes: quota,
      });
    }

    // Single block: stop autopay at cycle end; keep granting until currentEnd.
    if (razorpay && addonRow.razorpaySubscriptionId && !addonRow.razorpaySubscriptionId.startsWith("mock_")) {
      try {
        await razorpay.subscriptions.cancel(addonRow.razorpaySubscriptionId, true /* cancel_at_cycle_end */);
      } catch (err: any) {
        logger.warn({ err, subscriptionId: addonRow.razorpaySubscriptionId }, "Razorpay addon cancel failed");
      }
    }

    await db
      .update(addonSubscriptions)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(addonSubscriptions.id, addonRow.id));

    const quota = await recomputeUserQuota(userId);
    const state = await resolveSubscriptionState(userId);
    const refreshed = await getStorageAddonControl(userId);

    try {
      const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (user?.email) {
        await sendCancellationEmail({
          email: user.email,
          userName: user.name || "there",
          plan: "storage_addon",
          expiresAt: addonRow.currentEnd,
          userId,
          kind: "addon",
        });
      }
    } catch (mailErr) {
      logger.warn({ mailErr, userId }, "Addon cancellation email failed (non-fatal)");
    }

    res.json({
      success: true,
      message: addonRow.currentEnd
        ? `Auto-renew cancelled. +50MB stays available until ${addonRow.currentEnd.toLocaleDateString()}.`
        : "Storage auto-renew cancelled. Extra space stays for the rest of this billing period.",
      currentEnd: addonRow.currentEnd,
      cancelledBlocks: 1,
      addonBlocks: state.addonBlocks,
      addonHasAutopay: refreshed.hasAutopay,
      storageQuotaBytes: quota,
    });
  } catch (error) {
    logger.error({ error, userId }, "Failed to cancel storage add-on");
    res.status(500).json({ error: "Unable to cancel the storage add-on right now." });
  }
});

router.post("/activation", requireAuth, async (req: any, res: any) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const code = String(req.body.code || "").trim().toUpperCase();
  if (!code) return res.status(400).json({ error: "Activation code is required." });

  try {
    const { redeemActivationCode } = await import("../lib/activationEngine");
    const result = await redeemActivationCode({ userId, code });

    await markOnboardingComplete(userId).catch((err) =>
      logger.warn({ err, userId }, "markOnboardingComplete failed after activation"),
    );

    try {
      await sendBillingReceipts(userId, "activation_code", 0, code);
    } catch {
      /* optional */
    }

    res.json({
      success: true,
      message: "Account activated successfully",
      plan: result.plan,
      isPremium: true,
      expiresAt: result.expiresAt,
      storageQuotaBytes: result.storageQuotaBytes,
      organizationId: result.organizationId,
      code: result.code,
      renewalMode: "purchase",
    });
  } catch (error: any) {
    const status = Number(error?.status) || 500;
    if (status < 500) {
      return res.status(status).json({
        error: error?.message || "Unable to redeem activation code",
        code: error?.code,
      });
    }
    logger.error({ error, userId }, "Failed to process activation code");
    res.status(500).json({ error: "Unable to redeem activation code right now." });
  }
});

router.post("/free-activate", requireAuth, async (req: any, res: any) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  try {
    const current = await resolveSubscriptionState(userId);
    if (current.isPremium) {
      return res.status(409).json({
        error: "You already have an active paid plan. Free activate cannot downgrade it.",
        plan: current.plan,
        isPremium: true,
      });
    }

    const existing = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1);

    if (existing.length > 0) {
      await db
        .update(subscriptions)
        .set({ plan: "free", status: "free", expiresAt: null })
        .where(eq(subscriptions.userId, userId));
    } else {
      await db.insert(subscriptions).values({
        userId,
        plan: "free",
        status: "free",
        expiresAt: null,
      });
    }

    // Free plan gets 10MB storage limit; clear stacked bonuses
    await db
      .update(users)
      .set({
        storageQuotaBytes: FREE_STORAGE_BYTES,
        storageBonusBytes: 0,
        templateId: "minimal",
      })
      .where(eq(users.id, userId));
    const [profile] = await db
      .select({ handle: profiles.handle })
      .from(profiles)
      .where(eq(profiles.userId, userId))
      .limit(1);
    await db
      .update(profiles)
      .set({ isPremium: false, templateId: "minimal" })
      .where(eq(profiles.userId, userId));
    if (profile?.handle) {
      const { invalidatePortfolioRenderCache } = await import("../lib/portfolioRenderCache");
      invalidatePortfolioRenderCache(String(profile.handle));
    }
    await markOnboardingComplete(userId).catch((err) =>
      logger.warn({ err, userId }, "markOnboardingComplete failed after free activate"),
    );

    res.json({ success: true, message: "Free plan activated successfully", plan: "free", isPremium: false });
  } catch (error) {
    logger.error({ error, userId }, "Failed to activate free plan");
    res.status(500).json({ error: "Unable to activate free plan right now." });
  }
});

// Resolve the BEXO user a subscription webhook belongs to.
const findUserIdForSubscription = async (subscriptionId: string, notes?: Record<string, unknown>): Promise<string | null> => {
  const [paymentRow] = await db
    .select({ userId: payments.userId })
    .from(payments)
    .where(eq(payments.razorpaySubscriptionId, subscriptionId))
    .limit(1);
  if (paymentRow?.userId) return paymentRow.userId;

  const [subRow] = await db
    .select({ userId: subscriptions.userId })
    .from(subscriptions)
    .where(eq(subscriptions.razorpaySubscriptionId, subscriptionId))
    .limit(1);
  if (subRow?.userId) return subRow.userId;

  const noteUserId = typeof notes?.userId === "string" ? notes.userId : null;
  return noteUserId;
};

// Razorpay webhook — source of truth for autopay renewals and the fallback
// when the browser never calls /verify.
router.post("/webhook", async (req: any, res: any) => {
  try {
    if (!isRazorpayConfigured || !razorpayKeySecret) {
      return res.status(503).json({ error: "Payments are not configured." });
    }

    const signature = req.headers["x-razorpay-signature"];
    if (!signature || typeof signature !== "string") {
      return res.status(400).json({ error: "Missing webhook signature." });
    }

    // Prefer the dedicated webhook secret; fall back to the key secret with a warning.
    let webhookSecret = razorpayWebhookSecret;
    if (!webhookSecret) {
      logger.warn("RAZORPAY_WEBHOOK_SECRET not set — falling back to key secret for webhook verification");
      webhookSecret = razorpayKeySecret;
    }

    // Verify over the exact raw bytes when available (JSON.stringify can reorder/reformat).
    const rawBody: Buffer | undefined = req.rawBody;
    const body = rawBody ? rawBody.toString("utf8") : JSON.stringify(req.body);
    const expected = crypto.createHmac("sha256", webhookSecret).update(body).digest("hex");
    const left = Buffer.from(expected, "hex");
    const right = Buffer.from(signature, "hex");
    if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) {
      return res.status(400).json({ error: "Invalid webhook signature." });
    }

    const event = req.body?.event as string | undefined;
    const eventId = (req.body?.id as string | undefined) || "";
    const paymentEntity = req.body?.payload?.payment?.entity;
    const subscriptionEntity = req.body?.payload?.subscription?.entity;
    const paymentLinkEntity = req.body?.payload?.payment_link?.entity;

    const claimed = await claimWebhookEvent({
      eventId: eventId || `${event || "unknown"}:${paymentEntity?.id || subscriptionEntity?.id || paymentLinkEntity?.id || Date.now()}`,
      eventType: event || "unknown",
      payload: req.body,
    });
    if (claimed.claim === "duplicate") {
      return res.json({ received: true, duplicate: true });
    }

    let webhookFailed: string | null = null;
    try {
    // ---- Admin collect Payment Links / note-tagged charges ----
    {
      const notes = (paymentLinkEntity?.notes || paymentEntity?.notes || {}) as Record<string, unknown>;
      const bexoPaymentId =
        (typeof notes.bexo_payment_id === "string" && notes.bexo_payment_id) ||
        (typeof notes.bexoPaymentId === "string" && notes.bexoPaymentId) ||
        null;
      const isAdminCollectEvent =
        event === "payment_link.paid" ||
        (event === "payment.captured" &&
          (notes.kind === "admin_collect" || !!bexoPaymentId) &&
          !paymentEntity?.order_id);

      if (isAdminCollectEvent && bexoPaymentId) {
        const rzpPaymentId = (paymentEntity?.id as string | undefined) || null;
        const [row] = await db.select().from(payments).where(eq(payments.id, bexoPaymentId)).limit(1);
        if (row && row.status !== "success" && row.status !== "refunded") {
          await db
            .update(payments)
            .set({
              status: "success",
              razorpayPaymentId: rzpPaymentId || row.razorpayPaymentId,
            })
            .where(eq(payments.id, row.id));
          await generateAndStoreInvoice(row.id);
          await recordLedgerEvent({
            userId: row.userId,
            paymentId: row.id,
            eventType: "admin_collect_paid",
            amountPaise: row.amount,
            plan: row.plan,
            razorpayPaymentId: rzpPaymentId || undefined,
            idempotencyKey: `admin_collect_paid:${row.id}:${rzpPaymentId || "link"}`,
            metadata: {
              via: "webhook",
              event,
              paymentLinkId: paymentLinkEntity?.id || null,
            },
          });
          await sendBillingReceipts(
            row.userId,
            row.plan || "identity",
            row.amount / 100,
            rzpPaymentId || row.id,
          ).catch((err) => logger.warn({ err, paymentId: row.id }, "Collect receipt email failed"));
        }
        await markWebhookProcessed(claimed.rowId, "processed");
        return res.json({ received: true });
      }

      // Also settle admin_collect rows tagged on a captured payment that has an order_id
      if (event === "payment.captured" && bexoPaymentId && notes.kind === "admin_collect") {
        const rzpPaymentId = (paymentEntity?.id as string | undefined) || null;
        const [row] = await db.select().from(payments).where(eq(payments.id, bexoPaymentId)).limit(1);
        if (row && row.status !== "success" && row.status !== "refunded") {
          await db
            .update(payments)
            .set({
              status: "success",
              razorpayPaymentId: rzpPaymentId || row.razorpayPaymentId,
              razorpayOrderId: (paymentEntity?.order_id as string) || row.razorpayOrderId,
            })
            .where(eq(payments.id, row.id));
          await generateAndStoreInvoice(row.id);
          await recordLedgerEvent({
            userId: row.userId,
            paymentId: row.id,
            eventType: "admin_collect_paid",
            amountPaise: row.amount,
            plan: row.plan,
            razorpayPaymentId: rzpPaymentId || undefined,
            razorpayOrderId: (paymentEntity?.order_id as string) || undefined,
            idempotencyKey: `admin_collect_paid:${row.id}:${rzpPaymentId || "cap"}`,
            metadata: { via: "webhook", event },
          });
        }
        await markWebhookProcessed(claimed.rowId, "processed");
        return res.json({ received: true });
      }
    }

    // ---- One-time order payments (Student+, fallback orders) ----
    if (event === "payment.captured" && paymentEntity?.order_id) {
      const orderId = paymentEntity.order_id as string;
      const paymentId = paymentEntity.id as string;
      const [payment] = await db
        .select()
        .from(payments)
        .where(eq(payments.razorpayOrderId, orderId))
        .limit(1);

      if (!payment) {
        await markWebhookProcessed(claimed.rowId, "ignored");
        return res.json({ received: true, ignored: true });
      }

      if (
        payment.status !== "success" &&
        payment.status !== "awaiting_mandate" &&
        payment.kind !== "subscription"
      ) {
        // Storage pool increase (merge into existing add-on)
        if (payment.kind === "addon_increase" || paymentEntity?.notes?.kind === "addon_increase") {
          let addonId = String(paymentEntity?.notes?.addonId || "");
          let addBlocks = Math.floor(Number(paymentEntity?.notes?.addBlocks) || 0);
          let targetBlocks = Math.floor(Number(paymentEntity?.notes?.targetBlocks) || 0);
          if (razorpay && (!addonId || addBlocks < 1)) {
            try {
              const order: any = await razorpay.orders.fetch(orderId);
              if (order?.notes?.addonId) addonId = String(order.notes.addonId);
              if (order?.notes?.addBlocks) addBlocks = Math.floor(Number(order.notes.addBlocks) || 0);
              if (order?.notes?.targetBlocks) targetBlocks = Math.floor(Number(order.notes.targetBlocks) || 0);
            } catch (err) {
              logger.warn({ err, orderId }, "Webhook could not fetch addon increase order notes");
            }
          }

          await db
            .update(payments)
            .set({ razorpayPaymentId: paymentId, status: "success" })
            .where(eq(payments.id, payment.id));

          if (addonId && addBlocks >= 1) {
            await applyAddonIncrease({
              userId: payment.userId,
              addonId,
              targetBlocks: targetBlocks || addBlocks,
              addBlocks,
            });
            await generateAndStoreInvoice(payment.id);
            await sendBillingReceipts(payment.userId, "storage_addon", payment.amount / 100, paymentId);
          } else {
            logger.warn({ orderId, paymentId }, "Webhook addon increase missing notes");
          }
          await markWebhookProcessed(claimed.rowId, "processed");
          return res.json({ received: true });
        }

        // Trust the plan stored on our DB row; notes are only a legacy fallback.
        const storedPlan = parsePlanParam(payment.plan);
        const notePlan = parsePlanParam(paymentEntity.notes?.plan);
        const plan: PaidPlan = storedPlan ?? notePlan ?? "studentplus";
        const isBootstrap = payment.kind === "subscription_bootstrap";

        if (isBootstrap && SUBSCRIPTION_PLANS.includes(plan)) {
          // HARD MANDATE: capture first invoice, schedule delayed Autopay, do NOT activate.
          const expiresAt = await getRenewalExpiry(payment.userId, plan);
          await db
            .update(payments)
            .set({
              razorpayPaymentId: paymentId,
              status: "awaiting_mandate",
              plan,
              kind: "subscription_bootstrap",
            })
            .where(eq(payments.id, payment.id));
          try {
            await scheduleBootstrapAutopay({
              userId: payment.userId,
              plan,
              expiresAt,
              paymentRowId: payment.id,
              orderId,
              couponCode: payment.couponCode,
              existingSubscriptionId: payment.razorpaySubscriptionId,
            });
          } catch (subErr) {
            logger.error(
              { subErr, userId: payment.userId, orderId },
              "Webhook bootstrap paid but Autopay schedule failed",
            );
          }
          await recordLedgerEvent({
            userId: payment.userId,
            paymentId: payment.id,
            eventType: "first_invoice_captured",
            amountPaise: payment.amount,
            plan,
            razorpayPaymentId: paymentId,
            razorpayOrderId: orderId,
            idempotencyKey: `first_invoice:${payment.id}`,
            metadata: { via: "webhook", hardMandate: true },
          });
          await markWebhookProcessed(claimed.rowId, "processed");
          return res.json({ received: true, awaitingMandate: true });
        }

        await db
          .update(payments)
          .set({
            razorpayPaymentId: paymentId,
            status: "success",
            plan,
            kind: payment.kind || "order",
          })
          .where(eq(payments.id, payment.id));

        const state = await resolveSubscriptionState(payment.userId);
        const blocked = assertCanPurchase(state, plan);
        if (!blocked) {
          const expiresAt = await getRenewalExpiry(payment.userId, plan);
          await activatePaidPlan(payment.userId, plan, expiresAt);
          const couponNote =
            (typeof paymentEntity.notes?.coupon === "string" ? paymentEntity.notes.coupon : undefined) ||
            payment.couponCode ||
            undefined;
          await recordCouponRedemption(couponNote, { userId: payment.userId, paymentId: payment.id });
          await generateAndStoreInvoice(payment.id);
          await sendBillingReceipts(payment.userId, plan, payment.amount / 100, paymentId);
          await markOnboardingComplete(payment.userId).catch(() => undefined);
          await recordLedgerEvent({
            userId: payment.userId,
            paymentId: payment.id,
            eventType: "plan_activated",
            amountPaise: payment.amount,
            plan,
            razorpayPaymentId: paymentId,
            razorpayOrderId: orderId,
            idempotencyKey: `plan_activated:${payment.id}`,
            metadata: { via: "webhook" },
          });
        } else {
          logger.warn({ userId: payment.userId, plan, blocked }, "Webhook skipped activate: plan not purchasable");
        }
      }

      await markWebhookProcessed(claimed.rowId, "processed");
      return res.json({ received: true });
    }

    // ---- Subscription lifecycle (base plans + storage add-on) ----
    if (
      (event === "subscription.activated" || event === "subscription.charged") &&
      subscriptionEntity?.id
    ) {
      const subscriptionId = subscriptionEntity.id as string;

      // Storage add-on subscriptions are tracked in their own table.
      const [addonRow] = await db
        .select()
        .from(addonSubscriptions)
        .where(eq(addonSubscriptions.razorpaySubscriptionId, subscriptionId))
        .limit(1);

      if (addonRow) {
        const currentEnd = subscriptionEntity.current_end
          ? new Date(Number(subscriptionEntity.current_end) * 1000)
          : addMonthlyTerm();
        const quantity = Number(subscriptionEntity.quantity) || addonRow.blocks;

        await db
          .update(addonSubscriptions)
          .set({ status: "active", blocks: quantity, currentEnd, updatedAt: new Date() })
          .where(eq(addonSubscriptions.id, addonRow.id));

        const chargePaymentId: string | undefined = paymentEntity?.id;
        if (chargePaymentId) {
          const [alreadyRecorded] = await db
            .select({ id: payments.id })
            .from(payments)
            .where(eq(payments.razorpayPaymentId, chargePaymentId))
            .limit(1);
          if (!alreadyRecorded) {
            const [pendingRow] = await db
              .select()
              .from(payments)
              .where(and(eq(payments.razorpaySubscriptionId, subscriptionId), eq(payments.status, "pending")))
              .limit(1);
            let invoicePaymentId: string;
            if (pendingRow) {
              await db
                .update(payments)
                .set({ razorpayPaymentId: chargePaymentId, status: "success" })
                .where(eq(payments.id, pendingRow.id));
              invoicePaymentId = pendingRow.id;
            } else {
              const [inserted] = await db
                .insert(payments)
                .values({
                  userId: addonRow.userId,
                  razorpaySubscriptionId: subscriptionId,
                  razorpayPaymentId: chargePaymentId,
                  amount: Number(paymentEntity?.amount) || 0,
                  status: "success",
                  plan: "storage_addon",
                  kind: "subscription",
                })
                .returning();
              invoicePaymentId = inserted.id;
            }
            await generateAndStoreInvoice(invoicePaymentId);
            if (paymentEntity?.amount) {
              await sendBillingReceipts(addonRow.userId, "storage_addon", Number(paymentEntity.amount) / 100, chargePaymentId);
            }
          }
        }

        await recomputeUserQuota(addonRow.userId);
        return res.json({ received: true });
      }

      // Base plan subscription
      const userId = await findUserIdForSubscription(subscriptionId, subscriptionEntity.notes);
      if (!userId) {
        logger.warn({ subscriptionId, event }, "Subscription webhook: no matching user");
        return res.json({ received: true, ignored: true });
      }

      // Resolve which plan this subscription is for (payment row → notes → legacy growth).
      const [linkedPayment] = await db
        .select()
        .from(payments)
        .where(eq(payments.razorpaySubscriptionId, subscriptionId))
        .orderBy(desc(payments.createdAt))
        .limit(1);
      const plan: PaidPlan =
        parsePlanParam(linkedPayment?.plan) ?? parsePlanParam(subscriptionEntity.notes?.plan) ?? "growth";

      const expiresAt = subscriptionEntity.current_end
        ? new Date(Number(subscriptionEntity.current_end) * 1000)
        : planTermEnd(plan) || addMonthlyTerm();

      // Record the charge idempotently before activating.
      const chargePaymentId: string | undefined = paymentEntity?.id;
      let isFirstActivation = false;
      let invoicePaymentId: string | null = null;
      if (chargePaymentId) {
        const [pendingRow] = await db
          .select()
          .from(payments)
          .where(and(eq(payments.razorpaySubscriptionId, subscriptionId), eq(payments.status, "pending")))
          .limit(1);

        const [alreadyRecorded] = await db
          .select({ id: payments.id })
          .from(payments)
          .where(eq(payments.razorpayPaymentId, chargePaymentId))
          .limit(1);

        if (!alreadyRecorded) {
          if (pendingRow) {
            isFirstActivation = true;
            await db
              .update(payments)
              .set({ razorpayPaymentId: chargePaymentId, status: "success" })
              .where(eq(payments.id, pendingRow.id));
            invoicePaymentId = pendingRow.id;
          } else {
            // Renewal charge — record a fresh payment row
            const [inserted] = await db
              .insert(payments)
              .values({
                userId,
                razorpaySubscriptionId: subscriptionId,
                razorpayPaymentId: chargePaymentId,
                amount: Number(paymentEntity?.amount) || 0,
                status: "success",
                plan,
                kind: "subscription",
              })
              .returning();
            invoicePaymentId = inserted.id;
          }
        }
      }

      const previousFromNotes =
        typeof subscriptionEntity.notes?.previousSubscriptionId === "string"
          ? subscriptionEntity.notes.previousSubscriptionId
          : null;
      const [existingSub] = await db
        .select({ razorpaySubscriptionId: subscriptions.razorpaySubscriptionId })
        .from(subscriptions)
        .where(eq(subscriptions.userId, userId))
        .limit(1);
      const previousRzpId = previousFromNotes || existingSub?.razorpaySubscriptionId || null;

      await activatePaidPlan(userId, plan, expiresAt, {
        subscriptionId,
        planId: (subscriptionEntity.plan_id as string) || (await getRazorpayPlanIdFor(plan)) || null,
      });
      await cancelPreviousRazorpaySubscription(userId, previousRzpId, subscriptionId);
      await clearPaymentGrace(userId).catch((err) =>
        logger.warn({ err, userId }, "clearPaymentGrace after charge failed"),
      );

      if (isFirstActivation) {
        const couponNote =
          typeof subscriptionEntity.notes?.coupon === "string" ? subscriptionEntity.notes.coupon : undefined;
        await recordCouponRedemption(couponNote, { userId, paymentId: invoicePaymentId || null });
        await markOnboardingComplete(userId).catch(() => undefined);
      }
      if (invoicePaymentId) {
        await generateAndStoreInvoice(invoicePaymentId);
      }
      if (chargePaymentId && paymentEntity?.amount) {
        await sendBillingReceipts(userId, plan, Number(paymentEntity.amount) / 100, chargePaymentId);
      }

      return res.json({ received: true });
    }

    if (
      (event === "subscription.cancelled" || event === "subscription.halted" || event === "subscription.completed") &&
      subscriptionEntity?.id
    ) {
      const subscriptionId = subscriptionEntity.id as string;

      // Storage add-on lifecycle
      const [addonRow] = await db
        .select()
        .from(addonSubscriptions)
        .where(eq(addonSubscriptions.razorpaySubscriptionId, subscriptionId))
        .limit(1);
      if (addonRow) {
        await db
          .update(addonSubscriptions)
          .set({ status: "cancelled", updatedAt: new Date() })
          .where(eq(addonSubscriptions.id, addonRow.id));
        await recomputeUserQuota(addonRow.userId);
        try {
          const [u] = await db.select().from(users).where(eq(users.id, addonRow.userId)).limit(1);
          if (u?.email) {
            await sendCancellationEmail({
              email: u.email,
              userName: u.name || "there",
              plan: "storage_addon",
              expiresAt: addonRow.currentEnd,
              userId: addonRow.userId,
              kind: "addon",
            });
          }
        } catch (mailErr) {
          logger.warn({ mailErr, userId: addonRow.userId }, "Webhook addon cancel email failed");
        }
        logger.info({ userId: addonRow.userId, subscriptionId, event }, "Storage add-on autopay ended");
        return res.json({ received: true });
      }

      const userId = await findUserIdForSubscription(subscriptionId, subscriptionEntity.notes);
      if (userId) {
        // Access continues until expiresAt; clearing the link marks autopay as off.
        const [subRow] = await db
          .select()
          .from(subscriptions)
          .where(and(eq(subscriptions.userId, userId), eq(subscriptions.razorpaySubscriptionId, subscriptionId)))
          .limit(1);
        await db
          .update(subscriptions)
          .set({ razorpaySubscriptionId: null })
          .where(and(eq(subscriptions.userId, userId), eq(subscriptions.razorpaySubscriptionId, subscriptionId)));
        await setCancelAtPeriodEnd(userId, true);

        try {
          const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
          if (u?.email && event === "subscription.cancelled") {
            await sendCancellationEmail({
              email: u.email,
              userName: u.name || "there",
              plan: subRow?.plan || "plan",
              expiresAt: subRow?.expiresAt || null,
              userId,
              kind: "subscription",
            });
          }
          await recordLedgerEvent({
            userId,
            eventType: "subscription_cancelled",
            amountPaise: 0,
            plan: subRow?.plan,
            razorpaySubscriptionId: subscriptionId,
            idempotencyKey: `subscription_cancelled:webhook:${subscriptionId}:${event}`,
            metadata: { source: "webhook", event },
          });
        } catch (mailErr) {
          logger.warn({ mailErr, userId }, "Webhook cancel email/ledger failed");
        }

        // Halted with unpaid invoices → enter 15-day payment grace (still live until grace ends).
        if (event === "subscription.halted") {
          const graceUntil = await enterPaymentGrace(userId);
          await enqueueDunningEmail(userId, graceUntil, 0);
          logger.info({ userId, subscriptionId, graceUntil }, "Subscription halted — payment grace started");
        } else {
          logger.info({ userId, subscriptionId, event }, "Autopay ended — access runs until current expiry");
        }
      }
      return res.json({ received: true });
    }

    // Autopay charge failed → 15-day grace + dunning email (portfolio stays live).
    if (event === "payment.failed" || event === "subscription.pending") {
      const subscriptionId =
        (subscriptionEntity?.id as string | undefined) ||
        (paymentEntity?.subscription_id as string | undefined);
      if (subscriptionId) {
        const [addonRow] = await db
          .select()
          .from(addonSubscriptions)
          .where(eq(addonSubscriptions.razorpaySubscriptionId, subscriptionId))
          .limit(1);
        if (!addonRow) {
          const userId = await findUserIdForSubscription(subscriptionId, subscriptionEntity?.notes || paymentEntity?.notes);
          if (userId) {
            const [existing] = await db
              .select({ paymentFailedAt: users.paymentFailedAt, graceUntil: users.graceUntil })
              .from(users)
              .where(eq(users.id, userId))
              .limit(1);
            const graceUntil = existing?.graceUntil && existing.graceUntil.getTime() > Date.now()
              ? existing.graceUntil
              : await enterPaymentGrace(userId);
            if (!existing?.paymentFailedAt) {
              await enqueueDunningEmail(userId, graceUntil, 0);
            }
            logger.info({ userId, subscriptionId, event, graceUntil }, "Payment failed — grace window active");
          }
        }
      }
      return res.json({ received: true });
    }

    res.json({ received: true });
    } catch (innerErr) {
      webhookFailed = innerErr instanceof Error ? innerErr.message : String(innerErr);
      throw innerErr;
    } finally {
      await markWebhookProcessed(claimed.rowId, webhookFailed ? "failed" : "processed", webhookFailed || undefined);
    }
  } catch (error) {
    logger.error({ error }, "Razorpay webhook failed");
    res.status(500).json({ error: "Webhook processing failed." });
  }
});

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
      billingUrl: `${process.env.FRONTEND_URL || process.env.WEB_URL || "https://mybexo.cyou"}/billing`,
      pauseDate,
      dayBucket,
    },
  });
}

/** Cron: expire grace windows + send day-7/day-14 dunning + roll up analytics. */
router.post("/jobs/daily", async (req: any, res: any) => {
  const secret = process.env.CRON_SECRET || process.env.INTERNAL_JOB_SECRET;
  const provided = req.get("x-cron-secret") || req.query.secret;
  if (!secret || provided !== secret) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const { runDailyBillingAndAnalyticsJob } = await import("../lib/dailyJobs");
    const result = await runDailyBillingAndAnalyticsJob({
      cancelSubscription: async (subscriptionId) => {
        if (!razorpay || subscriptionId.startsWith("mock_")) return;
        await razorpay.subscriptions.cancel(subscriptionId, false);
      },
      refundPayment: async (paymentId, amountPaise) => {
        if (!razorpay || paymentId.startsWith("mock_")) return null;
        const refund: any = await razorpay.payments.refund(paymentId, {
          amount: amountPaise,
          notes: { reason: "awaiting_mandate_ttl" },
        } as any);
        return refund?.id ? { id: refund.id as string } : null;
      },
    });
    res.json(result);
  } catch (error) {
    logger.error({ error }, "Daily billing/analytics job failed");
    res.status(500).json({ error: "Job failed" });
  }
});

export default router;
