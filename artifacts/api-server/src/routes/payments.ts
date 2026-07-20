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
  getRenewalExpiry,
  resolveSubscriptionState,
  type PaidPlan,
} from "../lib/subscriptions";

const router = Router();

const razorpayKeyId = process.env.RAZORPAY_KEY_ID;
const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET;
const isRazorpayConfigured =
  !!razorpayKeyId &&
  !!razorpayKeySecret &&
  razorpayKeyId !== "rzp_test_YourKeyIdHere" &&
  razorpayKeySecret !== "YourSecretHere";

const razorpay = isRazorpayConfigured
  ? new Razorpay({ key_id: razorpayKeyId, key_secret: razorpayKeySecret })
  : null;

const planPrices: Record<PaidPlan, number> = {
  annual: 1499,
  lifetime: 2999,
};

const normalizeCoupon = (couponCode?: string) => couponCode?.trim().toUpperCase() || null;

const calculateAmount = (plan: PaidPlan, couponCode?: string) => {
  const base = planPrices[plan];
  const coupon = normalizeCoupon(couponCode);
  let discount = 0;

  const now = new Date();
  const expiryDate = new Date("2026-12-31T23:59:59Z");
  const isPromoValid = now.getTime() <= expiryDate.getTime();

  if (isPromoValid && (coupon === "BEXO2026" || coupon === "PROMO2026")) {
    if (plan === "annual") {
      discount = base - 999; // Promo → ₹999/year
    } else if (plan === "lifetime") {
      discount = base - 1999; // Promo → ₹1999
    }
  } else if (coupon === "BEXO50") {
    discount = base * 0.5;
  } else if (coupon === "STUDENT") {
    discount = 200;
  }

  const subtotal = Math.max(base - discount, 0);
  const gst = subtotal * 0.18;
  const total = Math.round(subtotal + gst);

  return { base, discount, gst, total, coupon };
};

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
        annual: calculateAmount("annual"),
        lifetime: calculateAmount("lifetime"),
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

    const pricing = calculateAmount(plan, couponCode);
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
    await db
      .update(payments)
      .set({ razorpayPaymentId: razorpay_payment_id, status: "success" })
      .where(eq(payments.id, payment.id));

    const expiresAt = await getRenewalExpiry(userId, plan);
    const activated = await activatePaidPlan(userId, plan, expiresAt);
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

// Razorpay webhook fallback when browser never calls /verify
router.post("/webhook", async (req: any, res: any) => {
  try {
    if (!isRazorpayConfigured || !razorpayKeySecret) {
      return res.status(503).json({ error: "Payments are not configured." });
    }

    const signature = req.headers["x-razorpay-signature"];
    if (!signature || typeof signature !== "string") {
      return res.status(400).json({ error: "Missing webhook signature." });
    }

    const body = JSON.stringify(req.body);
    const expected = crypto.createHmac("sha256", razorpayKeySecret).update(body).digest("hex");
    const left = Buffer.from(expected, "hex");
    const right = Buffer.from(signature, "hex");
    if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) {
      return res.status(400).json({ error: "Invalid webhook signature." });
    }

    const event = req.body?.event;
    const paymentEntity = req.body?.payload?.payment?.entity;
    if (event !== "payment.captured" || !paymentEntity?.order_id) {
      return res.json({ received: true });
    }

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

    if (payment.status !== "success") {
      await db
        .update(payments)
        .set({ razorpayPaymentId: paymentId, status: "success" })
        .where(eq(payments.id, payment.id));

      const planNote = (paymentEntity.notes?.plan || "annual") as PaidPlan;
      const plan = planNote === "lifetime" ? "lifetime" : "annual";
      const state = await resolveSubscriptionState(payment.userId);
      const blocked = assertCanPurchase(state, plan);
      if (!blocked) {
        const expiresAt = await getRenewalExpiry(payment.userId, plan);
        await activatePaidPlan(payment.userId, plan, expiresAt);
        await sendBillingReceipts(payment.userId, plan, payment.amount / 100, paymentId);
        await markOnboardingComplete(payment.userId).catch(() => undefined);
      } else {
        logger.warn({ userId: payment.userId, plan, blocked }, "Webhook skipped activate: plan not purchasable");
      }
    }

    res.json({ received: true });
  } catch (error) {
    logger.error({ error }, "Razorpay webhook failed");
    res.status(500).json({ error: "Webhook processing failed." });
  }
});

export default router;
