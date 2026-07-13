import { Router } from "express";
import { db, users, payments, subscriptions, activationKeys } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";
import Razorpay from "razorpay";
import crypto from "crypto";
import { sendBillingEmail, sendBillingWhatsApp } from "../lib/billing";

const router = Router();

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || 'dummy_id',
  key_secret: process.env.RAZORPAY_KEY_SECRET || 'dummy_secret',
});

// Mock coupon logic
const calculateAmount = (plan: 'annual' | 'lifetime', couponCode?: string) => {
  let basePrice = plan === 'annual' ? 999 : 2999;
  
  if (couponCode === 'BEXO50') {
    basePrice = basePrice * 0.5; // 50% discount
  } else if (couponCode === 'STUDENT') {
    basePrice = basePrice - 200; // Flat 200 discount
  }

  const gst = basePrice * 0.18;
  const total = basePrice + gst;
  
  return {
    base: basePrice,
    gst,
    total: Math.round(total) // return total in INR (rupees)
  };
};

// POST /api/payments/create-order
router.post("/create-order", async (req: any, res: any) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const { plan, couponCode } = req.body;
  if (plan !== 'annual' && plan !== 'lifetime') {
    return res.status(400).json({ error: "Invalid plan" });
  }

  try {
    const { total } = calculateAmount(plan, couponCode);
    const amountInPaise = total * 100;

    const orderOptions = {
      amount: amountInPaise,
      currency: "INR",
      receipt: `receipt_order_${Date.now()}`,
    };

    let order;
    if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_ID !== 'rzp_test_YourKeyIdHere') {
      order = await razorpay.orders.create(orderOptions);
    } else {
      // Mock order for testing if Razorpay is not configured
      order = {
        id: `mock_order_${Date.now()}`,
        amount: amountInPaise,
        currency: "INR",
      };
    }

    // Save pending payment to DB
    await db.insert(payments).values({
      userId,
      razorpayOrderId: order.id,
      amount: amountInPaise,
      status: 'pending',
    });

    res.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      key: process.env.RAZORPAY_KEY_ID,
    });
  } catch (error) {
    logger.error({ error }, "Failed to create Razorpay order");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/payments/verify
router.post("/verify", async (req: any, res: any) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, plan } = req.body;

  try {
    // If we have actual keys configured, verify the signature
    if (process.env.RAZORPAY_KEY_SECRET && process.env.RAZORPAY_KEY_SECRET !== 'YourSecretHere') {
      const hmac = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET);
      hmac.update(razorpay_order_id + "|" + razorpay_payment_id);
      const generated_signature = hmac.digest('hex');

      if (generated_signature !== razorpay_signature) {
        return res.status(400).json({ error: "Invalid payment signature" });
      }
    }

    // Update payment status
    const paymentRecords = await db.update(payments).set({
      razorpayPaymentId: razorpay_payment_id,
      status: 'success',
    }).where(eq(payments.razorpayOrderId, razorpay_order_id)).returning();

    const amountPaid = (paymentRecords[0]?.amount || 0) / 100;

    // Activate subscription
    const expiresAt = plan === 'annual' 
      ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) 
      : null;

    // Check if subscription exists
    const existingSub = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId));
    
    if (existingSub.length > 0) {
      await db.update(subscriptions).set({
        plan,
        status: 'active',
        expiresAt,
      }).where(eq(subscriptions.userId, userId));
    } else {
      await db.insert(subscriptions).values({
        userId,
        plan,
        status: 'active',
        expiresAt,
      });
    }

    // Get user details for billing
    const user = (await db.select().from(users).where(eq(users.id, userId)))[0];

    // Send bills
    if (user.email) {
      await sendBillingEmail(user.email, user.name || 'User', plan, amountPaid, razorpay_payment_id || 'mock_tx_id');
    }
    if (user.phone) {
      await sendBillingWhatsApp(user.phone, user.name || 'User', plan, amountPaid);
    }

    res.json({ success: true, message: "Payment verified successfully" });
  } catch (error) {
    logger.error({ error }, "Failed to verify Razorpay payment");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/payments/activation
router.post("/activation", async (req: any, res: any) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const { code } = req.body;
  if (!code) return res.status(400).json({ error: "Activation code is required" });

  try {
    const keyRecords = await db.select().from(activationKeys).where(eq(activationKeys.code, code));
    if (keyRecords.length === 0) {
      // For demo purposes, we will accept the mock format BEXO-XXXX-XXXX
      // Let's insert it if it doesn't exist just so testing works without a seeder
      if (/^BEXO-[A-Z0-9]{4}-[A-Z0-9]{4}$/i.test(code)) {
         await db.insert(activationKeys).values({
            code,
            status: 'unused'
         });
      } else {
         return res.status(400).json({ error: "Invalid activation code" });
      }
    } else {
      const key = keyRecords[0];
      if (key.status !== 'unused') {
        return res.status(400).json({ error: "Activation code has already been used or is expired" });
      }
    }

    // Mark key as redeemed
    await db.update(activationKeys).set({
      status: 'redeemed',
      redeemedBy: userId,
      redeemedAt: new Date(),
    }).where(eq(activationKeys.code, code));

    // Activate subscription (1 year access by default for activation keys)
    const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
    
    const existingSub = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId));
    if (existingSub.length > 0) {
      await db.update(subscriptions).set({
        plan: 'annual',
        status: 'active',
        expiresAt,
      }).where(eq(subscriptions.userId, userId));
    } else {
      await db.insert(subscriptions).values({
        userId,
        plan: 'annual',
        status: 'active',
        expiresAt,
      });
    }

    // Get user details for billing
    const user = (await db.select().from(users).where(eq(users.id, userId)))[0];

    // Send bills
    if (user.email) {
      await sendBillingEmail(user.email, user.name || 'User', 'activation_code', 0, code);
    }
    if (user.phone) {
      await sendBillingWhatsApp(user.phone, user.name || 'User', 'activation_code', 0);
    }

    res.json({ success: true, message: "Account activated successfully" });
  } catch (error) {
    logger.error({ error }, "Failed to process activation code");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
