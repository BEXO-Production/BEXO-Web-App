import { Router } from "express";
import {
  calculatePlanAmount,
  loadPricingCatalog,
  toPublicPricingPayload,
  validateCouponForPlan,
  type PurchasableId,
} from "../lib/pricingCatalog";
import { normalizePlanId, isPaidPlan } from "../lib/subscriptions";

const router = Router();

const parsePurchasable = (value: unknown): PurchasableId | null => {
  if (value === "storage_addon") return "storage_addon";
  const normalized = normalizePlanId(typeof value === "string" ? value : null);
  return normalized && isPaidPlan(normalized) ? normalized : null;
};

router.get("/", async (_req, res) => {
  try {
    const catalog = await loadPricingCatalog();
    res.json(await toPublicPricingPayload(catalog));
  } catch {
    res.status(500).json({ error: "Unable to load pricing." });
  }
});

router.post("/validate-coupon", async (req, res) => {
  const plan = parsePurchasable(req.body?.plan);
  const couponCode = String(req.body?.couponCode || "");

  if (!plan) {
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
  const plan = parsePurchasable(req.query.plan);
  const couponCode = typeof req.query.coupon === "string" ? req.query.coupon : undefined;
  const quantity = Math.max(1, Math.floor(Number(req.query.quantity) || 1));

  if (!plan) {
    res.status(400).json({ error: "Invalid plan." });
    return;
  }

  const pricing = await calculatePlanAmount(plan, couponCode, plan === "storage_addon" ? quantity : 1);
  res.json({ plan, pricing });
});

export default router;
