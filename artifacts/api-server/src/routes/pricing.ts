import { Router } from "express";
import {
  calculatePlanAmount,
  loadPricingCatalog,
  toPublicPricingPayload,
  validateCouponForPlan,
} from "../lib/pricingCatalog";
import type { PaidPlan } from "../lib/subscriptions";

const router = Router();

router.get("/", async (_req, res) => {
  try {
    const catalog = await loadPricingCatalog();
    res.json(toPublicPricingPayload(catalog));
  } catch {
    res.status(500).json({ error: "Unable to load pricing." });
  }
});

router.post("/validate-coupon", async (req, res) => {
  const plan = req.body?.plan as PaidPlan;
  const couponCode = String(req.body?.couponCode || "");

  if (plan !== "annual" && plan !== "lifetime") {
    return res.status(400).json({ valid: false, message: "Choose a valid plan." });
  }

  const result = await validateCouponForPlan(couponCode, plan);
  if (!result.valid) {
    return res.json({ valid: false, message: result.message || "Invalid coupon." });
  }

  return res.json({
    valid: true,
    coupon: result.pricing?.coupon,
    pricing: result.pricing,
  });
});

router.get("/quote", async (req, res): Promise<void> => {
  const plan = req.query.plan as PaidPlan;
  const couponCode = typeof req.query.coupon === "string" ? req.query.coupon : undefined;

  if (plan !== "annual" && plan !== "lifetime") {
    res.status(400).json({ error: "Invalid plan." });
    return;
  }

  const pricing = await calculatePlanAmount(plan, couponCode);
  res.json({ plan, pricing });
});

export default router;
