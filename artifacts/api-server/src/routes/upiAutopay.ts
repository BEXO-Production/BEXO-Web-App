import { Router } from "express";
import { logger } from "../lib/logger";
import { requireAuth } from "../middlewares/auth";
import { ensureBillingProfileForCheckout } from "../lib/billingProfile";
import { resolveSubscriptionState, isPaidPlan, type PaidPlan } from "../lib/subscriptions";
import {
  isUpiAutopayEnabled,
  isUpiAutopayPlan,
  mandateMaxAmountPaise,
  createAuthorizationCheckout,
  verifyAuthorization,
  cancelMandate,
  getMandateSummary,
  runUpiAutopayTick,
} from "../lib/upiAutopay";

const router = Router();

/** Whether the token-based engine should serve this request. */
router.get("/config", requireAuth, async (_req: any, res: any) => {
  res.json({ enabled: isUpiAutopayEnabled(), maxAmountPaise: mandateMaxAmountPaise() });
});

/**
 * Create the UPI Autopay authorization checkout (single payment: plan amount +
 * ₹2000 variable mandate). Falls through with 409 when the flag is off so the
 * frontend uses the legacy Subscriptions flow.
 */
router.post("/create", requireAuth, async (req: any, res: any) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  if (!isUpiAutopayEnabled()) {
    return res.status(409).json({ error: "UPI Autopay not enabled", code: "UPI_AUTOPAY_DISABLED" });
  }

  try {
    const plan = String(req.body?.plan || "").trim();
    if (!isPaidPlan(plan) || !isUpiAutopayPlan(plan)) {
      return res.status(400).json({ error: "This plan does not support UPI Autopay.", code: "PLAN_UNSUPPORTED" });
    }

    const billingGate = await ensureBillingProfileForCheckout(userId, req.body?.billing);
    if (!billingGate.ok) {
      return res.status(400).json({ error: billingGate.error, code: billingGate.code });
    }

    const result = await createAuthorizationCheckout({
      userId,
      plan: plan as PaidPlan,
      couponCode: req.body?.couponCode || null,
    });
    return res.json(result);
  } catch (err: any) {
    logger.error({ err, userId }, "upiAutopay create failed");
    return res.status(500).json({ error: "Could not start Autopay checkout. Please try again." });
  }
});

/** Verify the authorization payment, store the token, activate the plan. */
router.post("/verify", requireAuth, async (req: any, res: any) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body || {};
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ error: "Missing payment confirmation fields." });
  }

  try {
    const result = await verifyAuthorization({
      userId,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    });
    if (!result.ok) {
      return res.status(400).json({ error: result.error, code: result.code });
    }
    return res.json({ success: true, plan: result.plan, expiresAt: result.expiresAt });
  } catch (err: any) {
    logger.error({ err, userId }, "upiAutopay verify failed");
    return res.status(500).json({ error: "Verification failed. If you were charged it will reflect shortly." });
  }
});

/** Dashboard: current mandate + next debit summary. */
router.get("/summary", requireAuth, async (req: any, res: any) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  try {
    const summary = await getMandateSummary(userId);
    return res.json({ mandate: summary });
  } catch (err: any) {
    logger.error({ err, userId }, "upiAutopay summary failed");
    return res.status(500).json({ error: "Could not load Autopay details." });
  }
});

/** Cancel the mandate at period end (access continues until currentPeriodEnd). */
router.post("/cancel", requireAuth, async (req: any, res: any) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  try {
    const state = await resolveSubscriptionState(userId);
    const ok = await cancelMandate(userId);
    if (!ok) return res.status(404).json({ error: "No active Autopay mandate found." });
    return res.json({ success: true, accessUntil: state.subscription?.expiresAt || null });
  } catch (err: any) {
    logger.error({ err, userId }, "upiAutopay cancel failed");
    return res.status(500).json({ error: "Could not cancel Autopay. Please try again." });
  }
});

/** Cron: reminders + due-charge sweep. Guarded by CRON_SECRET. */
router.post("/jobs/tick", async (req: any, res: any) => {
  const secret = process.env.CRON_SECRET || process.env.INTERNAL_JOB_SECRET;
  const provided = req.get("x-cron-secret") || req.query.secret;
  if (!secret || provided !== secret) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const result = await runUpiAutopayTick();
    return res.json(result);
  } catch (err: any) {
    logger.error({ err }, "upiAutopay tick failed");
    return res.status(500).json({ error: "Tick failed" });
  }
});

export default router;
