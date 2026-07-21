import { Router } from "express";
import { db, users, payments, subscriptions, activationKeys } from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";
import { logger } from "../lib/logger";
import Razorpay from "razorpay";
import crypto from "crypto";
import { sendBillingEmail, sendBillingWhatsApp } from "../lib/billing";
import { markOnboardingComplete } from "../lib/lifecycleEmails";
import { requireAuth } from "../middlewares/auth";
import {
  FREE_STORAGE_BYTES,
  activatePaidPlan,
  addAnnualTerm,
  getRenewalExpiry,
  resolveSubscriptionState,
  type PaidPlan,
} from "../lib/subscriptions";
import {
  calculatePlanAmount,
  loadPricingCatalog,
  recordCouponRedemption,
  toPublicPricingPayload,
} from "../lib/pricingCatalog";

const router = Router();

const razorpayKeyId = process.env.RAZORPAY_KEY_ID;
const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET;
const razorpayAnnualPlanId = process.env.RAZORPAY_PLAN_ID_ANNUAL;
const razorpayWebhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
const isRazorpayConfigured =
  !!razorpayKeyId &&
  !!razorpayKeySecret &&
  razorpayKeyId !== "rzp_test_YourKeyIdHere" &&
  razorpayKeySecret !== "YourSecretHere";

const razorpay = isRazorpayConfigured
  ? new Razorpay({ key_id: razorpayKeyId, key_secret: razorpayKeySecret })
  : null;

const timingSafeEqualHex = (left: string, right: string) => {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

const assertCanPurchase = (state: Awaited<ReturnType<typeof resolveSubscriptionState>>, plan: PaidPlan) => {
  if (plan === "lifetime" && !state.canBuy.lifetime) {
    if (state.plan === "lifetime") {
      return "Lifetime Pro is already active on this account.";
    }
    return "You already have an active Yearly plan. Renew Yearly instead — Lifetime is not available on this screen.";
  }
  if (plan === "annual" && !state.canBuy.annual) {
    return "Yearly plan is not available for this account right now.";
  }
  return null;
};

const sendBillingReceipts = async (userId: string, plan: PaidPlan | "activation_code", amountPaid: number, reference: string) => {
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
    const state = await resolveSubscriptionState(userId);
    const [latestPayment] = await db
      .select()
      .from(payments)
      .where(eq(payments.userId, userId))
      .orderBy(desc(payments.createdAt))
      .limit(1);

    const catalog = await loadPricingCatalog();
    res.json({
      plan: state.plan,
      status: state.status,
      isPremium: state.isPremium,
      expiresAt: state.expiresAt,
      storageQuotaBytes: state.storageQuotaBytes,
      storageBonusBytes: state.storageBonusBytes,
      effectiveQuotaBytes: state.storageQuotaBytes,
      canBuy: state.canBuy,
      renewalMode: state.renewalMode,
      subscription: state.subscription
        ? {
            plan: state.subscription.plan,
            status: state.subscription.status,
            expiresAt: state.subscription.expiresAt,
            createdAt: state.subscription.createdAt,
            autopay: !!state.subscription.razorpaySubscriptionId,
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
      pricing: {
        ...toPublicPricingPayload(catalog),
        annual: await calculatePlanAmount("annual"),
        lifetime: await calculatePlanAmount("lifetime"),
      },
    });
  } catch (error) {
    logger.error({ error, userId }, "Failed to load billing status");
    res.status(500).json({ error: "Unable to load billing status right now." });
  }
});

router.post("/create-order", requireAuth, async (req: any, res: any) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const { plan, couponCode } = req.body;
  if (plan !== "annual" && plan !== "lifetime") {
    return res.status(400).json({ error: "Choose a valid plan." });
  }

  try {
    const current = await resolveSubscriptionState(userId);
    const blocked = assertCanPurchase(current, plan);
    if (blocked) {
      return res.status(409).json({ error: blocked, canBuy: current.canBuy, renewalMode: current.renewalMode });
    }

    // Yearly is an auto-renewing Razorpay Subscription — one-time orders are
    // only allowed for lifetime and for the annual storage add-on on lifetime.
    if (plan === "annual" && current.renewalMode !== "addon" && isRazorpayConfigured && razorpayAnnualPlanId) {
      return res.status(409).json({
        error: "Yearly is an auto-renewing subscription. Use subscription checkout instead.",
        code: "USE_SUBSCRIPTION",
        canBuy: current.canBuy,
        renewalMode: current.renewalMode,
      });
    }

    const pricing = await calculatePlanAmount(plan, couponCode);
    const amountInPaise = pricing.total * 100;
    const orderOptions = {
      amount: amountInPaise,
      currency: "INR",
      receipt: `bexo_${userId.slice(0, 8)}_${Date.now()}`,
      notes: {
        userId,
        plan,
        coupon: pricing.coupon || "",
        renewalMode: current.renewalMode,
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

// Yearly plan → Razorpay Subscription (autopay). Lifetime stays on one-time orders.
router.post("/create-subscription", requireAuth, async (req: any, res: any) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const couponCode = typeof req.body?.couponCode === "string" ? req.body.couponCode : undefined;

  try {
    const current = await resolveSubscriptionState(userId);
    const blocked = assertCanPurchase(current, "annual");
    if (blocked) {
      return res.status(409).json({ error: blocked, canBuy: current.canBuy, renewalMode: current.renewalMode });
    }
    if (current.renewalMode === "addon") {
      // Lifetime users buying yearly storage use a one-time order, not autopay.
      return res.status(409).json({
        error: "Yearly storage add-on on Lifetime is a one-time purchase. Use the regular checkout.",
        code: "USE_ORDER",
        canBuy: current.canBuy,
        renewalMode: current.renewalMode,
      });
    }
    if (current.subscription?.razorpaySubscriptionId && current.isPremium && current.plan === "annual") {
      return res.status(409).json({
        error: "Auto-renew is already on for your Yearly plan — no new subscription needed.",
        code: "SUBSCRIPTION_ACTIVE",
        renewalMode: current.renewalMode,
      });
    }

    const pricing = await calculatePlanAmount("annual", couponCode);
    const amountInPaise = pricing.total * 100;

    if (razorpay) {
      if (!razorpayAnnualPlanId) {
        return res.status(503).json({
          error: "Yearly autopay is not configured yet. Please contact support or try Lifetime.",
        });
      }

      // The Razorpay Plan carries a fixed amount; refuse checkout if our
      // catalog/coupon math no longer matches what the customer would be charged.
      try {
        const rzpPlan: any = await razorpay.plans.fetch(razorpayAnnualPlanId);
        const planAmount = Number(rzpPlan?.item?.amount);
        if (Number.isFinite(planAmount) && planAmount !== amountInPaise) {
          logger.error(
            { planAmount, amountInPaise, razorpayAnnualPlanId },
            "Razorpay plan amount mismatch with catalog pricing",
          );
          return res.status(409).json({
            error: "Pricing is being updated. Please try again in a few minutes or contact support.",
            code: "PLAN_AMOUNT_MISMATCH",
          });
        }
      } catch (planErr) {
        logger.warn({ planErr, razorpayAnnualPlanId }, "Could not fetch Razorpay plan for amount check");
      }

      const subscription: any = await razorpay.subscriptions.create({
        plan_id: razorpayAnnualPlanId,
        total_count: 10, // 10 yearly renewals; customer can cancel anytime
        quantity: 1,
        customer_notify: 1,
        notes: {
          userId,
          plan: "annual",
          coupon: pricing.coupon || "",
        },
      } as any);

      await db.insert(payments).values({
        userId,
        razorpaySubscriptionId: subscription.id,
        amount: amountInPaise,
        status: "pending",
        plan: "annual",
        kind: "subscription",
      });

      return res.json({
        subscriptionId: subscription.id,
        amount: amountInPaise,
        currency: "INR",
        key: razorpayKeyId,
        mock: false,
        pricing,
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
        plan: "annual",
        kind: "subscription",
      });
      return res.json({
        subscriptionId: mockId,
        amount: amountInPaise,
        currency: "INR",
        key: razorpayKeyId,
        mock: true,
        pricing,
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

// Verify a Razorpay Subscription checkout (Yearly autopay first charge).
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
    let expiresAt = await getRenewalExpiry(userId, "annual");
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

    const activated = await activatePaidPlan(userId, "annual", expiresAt, {
      subscriptionId: razorpay_subscription_id,
      planId: razorpayAnnualPlanId || null,
    });
    const couponCode = typeof req.body?.couponCode === "string" ? req.body.couponCode : undefined;
    await recordCouponRedemption(couponCode);
    await sendBillingReceipts(userId, "annual", payment.amount / 100, razorpay_payment_id);
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

  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, plan } = req.body;
  if (!razorpay_order_id || !razorpay_payment_id || !plan) {
    return res.status(400).json({ error: "Missing payment verification details." });
  }
  if (plan !== "annual" && plan !== "lifetime") {
    return res.status(400).json({ error: "Choose a valid plan." });
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

    // Mark success before activating so retries are idempotent and do not double-stack bonus.
    // Persist plan/kind too so webhooks + support can trust the DB row (legacy rows lack them).
    await db
      .update(payments)
      .set({ razorpayPaymentId: razorpay_payment_id, status: "success", plan, kind: "order" })
      .where(eq(payments.id, payment.id));

    const expiresAt = await getRenewalExpiry(userId, plan);
    const activated = await activatePaidPlan(userId, plan, expiresAt);
    const couponCode =
      typeof req.body?.couponCode === "string" ? req.body.couponCode : undefined;
    await recordCouponRedemption(couponCode);
    await sendBillingReceipts(userId, plan, payment.amount / 100, razorpay_payment_id);
    await markOnboardingComplete(userId).catch((err) =>
      logger.warn({ err, userId }, "markOnboardingComplete failed after payment"),
    );

    res.json({
      success: true,
      message: "Payment verified successfully",
      plan: activated.plan,
      isPremium: true,
      expiresAt: activated.expiresAt,
      storageQuotaBytes: activated.storageQuotaBytes,
      storageBonusBytes: activated.storageBonusBytes,
      stacked: activated.stacked,
      renewalMode: activated.renewalMode,
    });
  } catch (error) {
    logger.error({ error, userId }, "Failed to verify Razorpay payment");
    res.status(500).json({ error: "Unable to verify payment right now." });
  }
});

router.post("/activation", requireAuth, async (req: any, res: any) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const code = String(req.body.code || "").trim().toUpperCase();
  if (!code) return res.status(400).json({ error: "Activation code is required." });

  try {
    const [redeemedKey] = await db
      .update(activationKeys)
      .set({
        status: "redeemed",
        redeemedBy: userId,
        redeemedAt: new Date(),
      })
      .where(and(eq(activationKeys.code, code), eq(activationKeys.status, "unused")))
      .returning();

    if (!redeemedKey) {
      const [existingKey] = await db.select().from(activationKeys).where(eq(activationKeys.code, code)).limit(1);
      if (!existingKey) {
        return res.status(400).json({ error: "Invalid activation code. Please check and try again." });
      }
      return res.status(400).json({ error: "This activation code has already been used or is no longer active." });
    }

    const expiresAt = await getRenewalExpiry(userId, "annual");
    const activated = await activatePaidPlan(userId, "annual", expiresAt);

    await db.insert(payments).values({
      userId,
      razorpayOrderId: `activation_${redeemedKey.id}`,
      razorpayPaymentId: code,
      amount: 0,
      status: "success",
    });

    await sendBillingReceipts(userId, "activation_code", 0, code);
    await markOnboardingComplete(userId).catch((err) =>
      logger.warn({ err, userId }, "markOnboardingComplete failed after activation"),
    );

    res.json({
      success: true,
      message: "Account activated successfully",
      plan: activated.plan,
      isPremium: true,
      expiresAt: activated.expiresAt,
      storageQuotaBytes: activated.storageQuotaBytes,
      storageBonusBytes: activated.storageBonusBytes,
      stacked: activated.stacked,
      renewalMode: activated.renewalMode,
    });
  } catch (error) {
    logger.error({ error, userId }, "Failed to process activation code");
    res.status(500).json({ error: "Unable to redeem activation code right now." });
  }
});

router.post("/free-activate", requireAuth, async (req: any, res: any) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  try {
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
      .set({ storageQuotaBytes: FREE_STORAGE_BYTES, storageBonusBytes: 0 })
      .where(eq(users.id, userId));
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
    const paymentEntity = req.body?.payload?.payment?.entity;
    const subscriptionEntity = req.body?.payload?.subscription?.entity;

    // ---- One-time order payments (Lifetime, annual add-on) ----
    if (event === "payment.captured" && paymentEntity?.order_id) {
      const orderId = paymentEntity.order_id as string;
      const paymentId = paymentEntity.id as string;
      const [payment] = await db
        .select()
        .from(payments)
        .where(eq(payments.razorpayOrderId, orderId))
        .limit(1);

      if (!payment) {
        return res.json({ received: true, ignored: true });
      }

      if (payment.status !== "success" && payment.kind !== "subscription") {
        // Trust the plan stored on our DB row; notes are only a legacy fallback.
        const storedPlan = payment.plan === "lifetime" || payment.plan === "annual" ? payment.plan : null;
        const planNote = (paymentEntity.notes?.plan || "annual") as PaidPlan;
        const plan: PaidPlan = storedPlan ?? (planNote === "lifetime" ? "lifetime" : "annual");

        await db
          .update(payments)
          .set({ razorpayPaymentId: paymentId, status: "success", plan, kind: "order" })
          .where(eq(payments.id, payment.id));

        const state = await resolveSubscriptionState(payment.userId);
        const blocked = assertCanPurchase(state, plan);
        if (!blocked) {
          const expiresAt = await getRenewalExpiry(payment.userId, plan);
          await activatePaidPlan(payment.userId, plan, expiresAt);
          const couponNote = typeof paymentEntity.notes?.coupon === "string" ? paymentEntity.notes.coupon : undefined;
          await recordCouponRedemption(couponNote);
          await sendBillingReceipts(payment.userId, plan, payment.amount / 100, paymentId);
          await markOnboardingComplete(payment.userId).catch(() => undefined);
        } else {
          logger.warn({ userId: payment.userId, plan, blocked }, "Webhook skipped activate: plan not purchasable");
        }
      }

      return res.json({ received: true });
    }

    // ---- Yearly autopay subscription lifecycle ----
    if (
      (event === "subscription.activated" || event === "subscription.charged") &&
      subscriptionEntity?.id
    ) {
      const subscriptionId = subscriptionEntity.id as string;
      const userId = await findUserIdForSubscription(subscriptionId, subscriptionEntity.notes);
      if (!userId) {
        logger.warn({ subscriptionId, event }, "Subscription webhook: no matching user");
        return res.json({ received: true, ignored: true });
      }

      const expiresAt = subscriptionEntity.current_end
        ? new Date(Number(subscriptionEntity.current_end) * 1000)
        : addAnnualTerm();

      // Record the charge idempotently before activating.
      const chargePaymentId: string | undefined = paymentEntity?.id;
      let isFirstActivation = false;
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
          } else {
            // Renewal charge — record a fresh payment row
            await db.insert(payments).values({
              userId,
              razorpaySubscriptionId: subscriptionId,
              razorpayPaymentId: chargePaymentId,
              amount: Number(paymentEntity?.amount) || 0,
              status: "success",
              plan: "annual",
              kind: "subscription",
            });
          }
        }
      }

      await activatePaidPlan(userId, "annual", expiresAt, {
        subscriptionId,
        planId: (subscriptionEntity.plan_id as string) || razorpayAnnualPlanId || null,
      });

      if (isFirstActivation) {
        const couponNote =
          typeof subscriptionEntity.notes?.coupon === "string" ? subscriptionEntity.notes.coupon : undefined;
        await recordCouponRedemption(couponNote);
        await markOnboardingComplete(userId).catch(() => undefined);
      }
      if (chargePaymentId && paymentEntity?.amount) {
        await sendBillingReceipts(userId, "annual", Number(paymentEntity.amount) / 100, chargePaymentId);
      }

      return res.json({ received: true });
    }

    if (
      (event === "subscription.cancelled" || event === "subscription.halted" || event === "subscription.completed") &&
      subscriptionEntity?.id
    ) {
      const subscriptionId = subscriptionEntity.id as string;
      const userId = await findUserIdForSubscription(subscriptionId, subscriptionEntity.notes);
      if (userId) {
        // Access continues until expiresAt; clearing the link marks autopay as off
        // so status endpoints/UI stop showing "auto-renew on".
        await db
          .update(subscriptions)
          .set({ razorpaySubscriptionId: null })
          .where(and(eq(subscriptions.userId, userId), eq(subscriptions.razorpaySubscriptionId, subscriptionId)));
        logger.info({ userId, subscriptionId, event }, "Autopay ended — access runs until current expiry");
      }
      return res.json({ received: true });
    }

    // payment.failed and other events are acknowledged without action.
    res.json({ received: true });
  } catch (error) {
    logger.error({ error }, "Razorpay webhook failed");
    res.status(500).json({ error: "Webhook processing failed." });
  }
});

export default router;
