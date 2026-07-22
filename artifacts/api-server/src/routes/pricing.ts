import { Router } from "express";
import {
  buildCheckoutQuote,
  loadPricingCatalog,
  toPublicPricingPayload,
  validateCouponForPlan,
  type PurchasableId,
} from "../lib/pricingCatalog";
import { normalizePlanId, isPaidPlan } from "../lib/subscriptions";
import { requireAuth } from "../middlewares/auth";

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

router.post("/validate-coupon", async (req: any, res) => {
  const plan = parsePurchasable(req.body?.plan);
  const couponCode = String(req.body?.couponCode || "");
  // Optional auth — when present, block already-redeemed codes per user.
  const userId = req.user?.id || null;

  if (!plan) {
    return res.status(400).json({ valid: false, message: "Choose a valid plan." });
  }

  const result = await validateCouponForPlan(couponCode, plan, userId);
  if (!result.valid) {
    return res.json({ valid: false, message: result.message || "Invalid coupon." });
  }

  return res.json({
    valid: true,
    coupon: result.pricing?.coupon,
    pricing: result.pricing,
    quote: result.quote,
  });
});

// Prefer authenticated validate so per-user redemption works from checkout.
router.post("/validate-coupon-auth", requireAuth, async (req: any, res) => {
  const plan = parsePurchasable(req.body?.plan);
  const couponCode = String(req.body?.couponCode || "");
  const userId = req.user?.id;

  if (!plan) {
    return res.status(400).json({ valid: false, message: "Choose a valid plan." });
  }

  const result = await validateCouponForPlan(couponCode, plan, userId);
  if (!result.valid) {
    return res.json({ valid: false, message: result.message || "Invalid coupon." });
  }

  return res.json({
    valid: true,
    coupon: result.pricing?.coupon,
    pricing: result.pricing,
    quote: result.quote,
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

  const quote = await buildCheckoutQuote(plan, couponCode, quantity);
  res.json({
    plan: quote.plan,
    quantity: quote.quantity,
    pricing: quote.first, // backward compatible
    list: quote.list,
    first: quote.first,
    discountApplies: quote.discountApplies,
    isSubscription: quote.isSubscription,
    renewalLabel: quote.renewalLabel,
    message: quote.message,
    quote,
  });
});

export default router;
