import { Router } from "express";
import { db, users, payments, subscriptions, activationKeys } from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";
import { logger } from "../lib/logger";
import Razorpay from "razorpay";
import crypto from "crypto";
import { sendBillingEmail, sendBillingWhatsApp } from "../lib/billing";
import {
  PRO_STORAGE_BYTES,
  addAnnualTerm,
  resolveSubscriptionState,
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

type PaidPlan = "annual" | "lifetime";

const planPrices: Record<PaidPlan, number> = {
  annual: 999,
  lifetime: 2999,
};

const normalizeCoupon = (couponCode?: string) => couponCode?.trim().toUpperCase() || null;

const calculateAmount = (plan: PaidPlan, couponCode?: string) => {
  const base = planPrices[plan];
  const coupon = normalizeCoupon(couponCode);
  let discount = 0;

  if (coupon === "BEXO50") {
    discount = base * 0.5;
  } else if (coupon === "STUDENT") {
    discount = 200;
  }

  const subtotal = Math.max(base - discount, 0);
  const gst = subtotal * 0.18;
  const total = Math.round(subtotal + gst);

  return { base, discount, gst, total, coupon };
};

const getRenewalExpiry = async (userId: string, plan: PaidPlan) => {
  if (plan === "lifetime") return null;

  const state = await resolveSubscriptionState(userId);
  const start =
    state.subscription?.plan === "annual" &&
    state.subscription.status === "active" &&
    state.subscription.expiresAt &&
    state.subscription.expiresAt.getTime() > Date.now()
      ? state.subscription.expiresAt
      : new Date();

  return addAnnualTerm(start);
};

const timingSafeEqualHex = (left: string, right: string) => {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

const activateSubscription = async (userId: string, plan: PaidPlan, expiresAt: Date | null) => {
  const existing = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1);

  if (existing.length > 0) {
    await db
      .update(subscriptions)
      .set({ plan, status: "active", expiresAt })
      .where(eq(subscriptions.userId, userId));
  } else {
    await db.insert(subscriptions).values({
      userId,
      plan,
      status: "active",
      expiresAt,
    });
  }

  await db.update(users).set({ storageQuotaBytes: PRO_STORAGE_BYTES }).where(eq(users.id, userId));
};

const sendBillingReceipts = async (userId: string, plan: PaidPlan | "activation_code", amountPaid: number, reference: string) => {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return;

  if (user.email) {
    sendBillingEmail(user.email, user.name || "User", plan, amountPaid, reference).catch((err) =>
      logger.error({ err, userId }, "Background billing email failed"),
    );
  }

  if (user.phone) {
    sendBillingWhatsApp(user.phone, user.name || "User", plan, amountPaid).catch((err) =>
      logger.error({ err, userId }, "Background billing WhatsApp failed"),
    );
  }
};

router.get("/status", async (req: any, res: any) => {
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

router.post("/create-order", async (req: any, res: any) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const { plan, couponCode } = req.body;
  if (plan !== "annual" && plan !== "lifetime") {
    return res.status(400).json({ error: "Choose a valid plan." });
  }

  try {
    const current = await resolveSubscriptionState(userId);
    if (current.plan === "lifetime") {
      return res.status(409).json({ error: "Lifetime Pro is already active on this account." });
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
    });
  } catch (error) {
    logger.error({ error, userId }, "Failed to create Razorpay order");
    res.status(500).json({ error: "Unable to start checkout right now." });
  }
});

router.post("/verify", async (req: any, res: any) => {
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
      return res.json({ success: true, message: "Payment already verified.", plan: state.plan, isPremium: state.isPremium });
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

    await db
      .update(payments)
      .set({ razorpayPaymentId: razorpay_payment_id, status: "success" })
      .where(eq(payments.id, payment.id));

    const expiresAt = await getRenewalExpiry(userId, plan);
    await activateSubscription(userId, plan, expiresAt);
    await sendBillingReceipts(userId, plan, payment.amount / 100, razorpay_payment_id);

    res.json({ success: true, message: "Payment verified successfully", plan, isPremium: true, expiresAt });
  } catch (error) {
    logger.error({ error, userId }, "Failed to verify Razorpay payment");
    res.status(500).json({ error: "Unable to verify payment right now." });
  }
});

router.post("/activation", async (req: any, res: any) => {
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
    await activateSubscription(userId, "annual", expiresAt);

    await db.insert(payments).values({
      userId,
      razorpayOrderId: `activation_${redeemedKey.id}`,
      razorpayPaymentId: code,
      amount: 0,
      status: "success",
    });

    await sendBillingReceipts(userId, "activation_code", 0, code);

    res.json({ success: true, message: "Account activated successfully", plan: "annual", isPremium: true, expiresAt });
  } catch (error) {
    logger.error({ error, userId }, "Failed to process activation code");
    res.status(500).json({ error: "Unable to redeem activation code right now." });
  }
});

export default router;
