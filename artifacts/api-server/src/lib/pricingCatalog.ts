import { and, asc, eq, sql } from "drizzle-orm";
import { billingSettings, db, pricingCoupons, pricingPlans } from "@workspace/db";
import type { PaidPlan } from "./subscriptions";
import { logger } from "./logger";

export type PublicPlanId = "free" | "annual" | "lifetime";

export type PricingPlanRow = {
  id: PublicPlanId;
  displayName: string;
  subtitle: string | null;
  priceInrExGst: number;
  storageBytes: number;
  isPurchasable: boolean;
  sortOrder: number;
  isHighlighted: boolean;
  features: string[];
};

export type PricingBreakdown = {
  base: number;
  discount: number;
  subtotal: number;
  gst: number;
  total: number;
  coupon: string | null;
  gstRate: number;
};

const FALLBACK_PLANS: PricingPlanRow[] = [
  {
    id: "free",
    displayName: "Free",
    subtitle: "Publish a path-based portfolio",
    priceInrExGst: 0,
    storageBytes: 10 * 1024 * 1024,
    isPurchasable: true,
    sortOrder: 0,
    isHighlighted: false,
    features: ["10MB storage", "Path-based portfolio", "atbexo.com link"],
  },
  {
    id: "annual",
    displayName: "Yearly",
    subtitle: "Best for students & professionals",
    priceInrExGst: 799,
    storageBytes: 100 * 1024 * 1024,
    isPurchasable: true,
    sortOrder: 1,
    isHighlighted: true,
    features: [
      "Premium templates",
      "100MB cloud storage base",
      "yourname.atbexo.com",
      "AI resume parses",
      "Auto-renews yearly via Razorpay Autopay",
    ],
  },
  {
    id: "lifetime",
    displayName: "Lifetime",
    subtitle: "Best for students & professionals",
    priceInrExGst: 1999,
    storageBytes: 50 * 1024 * 1024,
    isPurchasable: true,
    sortOrder: 2,
    isHighlighted: false,
    features: [
      "Everything in Yearly (templates & subdomain)",
      "50MB storage base",
      "One-time payment — no renewals",
      "Forever hosting",
    ],
  },
];

const CACHE_TTL_MS = 60_000;

let cache: {
  expiresAt: number;
  plans: PricingPlanRow[];
  gstRate: number;
  currency: string;
} | null = null;

function normalizePlan(row: typeof pricingPlans.$inferSelect): PricingPlanRow {
  const features = Array.isArray(row.features)
    ? (row.features as unknown[]).map(String)
  : [];
  return {
    id: row.id as PublicPlanId,
    displayName: row.displayName,
    subtitle: row.subtitle,
    priceInrExGst: Number(row.priceInrExGst) || 0,
    storageBytes: Number(row.storageBytes) || 0,
    isPurchasable: !!row.isPurchasable,
    sortOrder: Number(row.sortOrder) || 0,
    isHighlighted: !!row.isHighlighted,
    features,
  };
}

export async function loadPricingCatalog(force = false): Promise<{
  plans: PricingPlanRow[];
  gstRate: number;
  currency: string;
}> {
  if (!force && cache && Date.now() < cache.expiresAt) {
    return { plans: cache.plans, gstRate: cache.gstRate, currency: cache.currency };
  }

  try {
    const [settings] = await db.select().from(billingSettings).where(eq(billingSettings.id, "default")).limit(1);
    const planRows = await db
      .select()
      .from(pricingPlans)
      .where(eq(pricingPlans.isActive, true))
      .orderBy(asc(pricingPlans.sortOrder));

    const plans =
      planRows.length > 0 ? planRows.map(normalizePlan) : FALLBACK_PLANS;
    const gstRate = Number(settings?.gstRate) > 0 ? Number(settings?.gstRate) : 0.18;
    const currency = settings?.currency || "INR";

    cache = {
      expiresAt: Date.now() + CACHE_TTL_MS,
      plans,
      gstRate,
      currency,
    };
    return { plans, gstRate, currency };
  } catch (error) {
    logger.warn({ error }, "Failed to load pricing catalog — using fallbacks");
    return { plans: FALLBACK_PLANS, gstRate: 0.18, currency: "INR" };
  }
}

export function invalidatePricingCache() {
  cache = null;
}

export async function getPlanById(planId: PublicPlanId | PaidPlan | "free"): Promise<PricingPlanRow | undefined> {
  const { plans } = await loadPricingCatalog();
  return plans.find((p) => p.id === planId);
}

export async function getPlanPriceInr(plan: PaidPlan): Promise<number> {
  const row = await getPlanById(plan);
  return row?.priceInrExGst ?? (plan === "annual" ? 799 : 1999);
}

export async function getPlanStorageBytes(plan: PublicPlanId): Promise<number> {
  const row = await getPlanById(plan);
  if (row) return row.storageBytes;
  if (plan === "annual") return 100 * 1024 * 1024;
  if (plan === "lifetime") return 50 * 1024 * 1024;
  return 10 * 1024 * 1024;
}

type CouponRow = typeof pricingCoupons.$inferSelect;

function couponIsValid(row: CouponRow, now = new Date()): boolean {
  if (!row.isActive) return false;
  if (row.validFrom && row.validFrom.getTime() > now.getTime()) return false;
  if (row.validUntil && row.validUntil.getTime() < now.getTime()) return false;
  if (row.maxUses != null && row.usedCount >= row.maxUses) return false;
  return true;
}

function discountFromCoupon(row: CouponRow, plan: PaidPlan, base: number): number {
  if (row.discountType === "percent" && row.percentOff != null) {
    return Math.round(base * (Number(row.percentOff) / 100));
  }
  if (row.discountType === "inr_fixed" && row.inrOff != null) {
    return Math.min(base, Number(row.inrOff));
  }
  if (row.discountType === "plan_prices" && row.planPrices && typeof row.planPrices === "object") {
    const prices = row.planPrices as Record<string, number>;
    const target = Number(prices[plan]);
    if (Number.isFinite(target) && target >= 0) {
      return Math.max(base - target, 0);
    }
  }
  return 0;
}

export async function findActiveCoupon(code?: string | null): Promise<CouponRow | null> {
  const normalized = code?.trim().toUpperCase();
  if (!normalized) return null;

  try {
    const [row] = await db
      .select()
      .from(pricingCoupons)
      .where(
        and(
          sql`upper(${pricingCoupons.code}) = ${normalized}`,
          eq(pricingCoupons.isActive, true),
        ),
      )
      .limit(1);
    if (!row || !couponIsValid(row)) return null;
    return row;
  } catch (error) {
    logger.warn({ error, code: normalized }, "Coupon lookup failed");
    return null;
  }
}

export async function calculatePlanAmount(
  plan: PaidPlan,
  couponCode?: string,
): Promise<PricingBreakdown> {
  const { gstRate } = await loadPricingCatalog();
  const base = await getPlanPriceInr(plan);
  const couponRow = await findActiveCoupon(couponCode);
  const discount = couponRow ? discountFromCoupon(couponRow, plan, base) : 0;
  const subtotal = Math.max(base - discount, 0);
  const gst = subtotal * gstRate;
  const total = Math.round(subtotal + gst);

  return {
    base,
    discount,
    subtotal,
    gst,
    total,
    coupon: couponRow ? couponRow.code.toUpperCase() : null,
    gstRate,
  };
}

export async function validateCouponForPlan(
  couponCode: string,
  plan: PaidPlan,
): Promise<{ valid: boolean; message?: string; pricing?: PricingBreakdown }> {
  const normalized = couponCode.trim().toUpperCase();
  if (!normalized) {
    return { valid: false, message: "Enter a coupon code." };
  }

  const couponRow = await findActiveCoupon(normalized);
  if (!couponRow) {
    return { valid: false, message: "This coupon is invalid or expired." };
  }

  const pricing = await calculatePlanAmount(plan, normalized);

  // plan_prices coupons lock an explicit price; they stay valid even when the
  // list price already matches (discount 0), e.g. EARLYBIRD at launch pricing.
  const locksPlanPrice =
    couponRow.discountType === "plan_prices" &&
    couponRow.planPrices &&
    typeof couponRow.planPrices === "object" &&
    Number.isFinite(Number((couponRow.planPrices as Record<string, number>)[plan]));

  if (pricing.discount <= 0 && !locksPlanPrice) {
    return { valid: false, message: "This coupon does not apply to the selected plan." };
  }

  return { valid: true, pricing };
}

export async function recordCouponRedemption(code: string | null | undefined) {
  const normalized = code?.trim().toUpperCase();
  if (!normalized) return;
  try {
    await db
      .update(pricingCoupons)
      .set({
        usedCount: sql`${pricingCoupons.usedCount} + 1`,
        updatedAt: new Date(),
      })
      .where(sql`upper(${pricingCoupons.code}) = ${normalized}`);
    invalidatePricingCache();
  } catch (error) {
    logger.warn({ error, code: normalized }, "Failed to record coupon redemption");
  }
}

export function toPublicPricingPayload(catalog: Awaited<ReturnType<typeof loadPricingCatalog>>) {
  return {
    currency: catalog.currency,
    gstRate: catalog.gstRate,
    plans: catalog.plans.map((p) => ({
      id: p.id,
      displayName: p.displayName,
      subtitle: p.subtitle,
      priceInrExGst: p.priceInrExGst,
      storageBytes: p.storageBytes,
      isPurchasable: p.isPurchasable,
      isHighlighted: p.isHighlighted,
      features: p.features,
    })),
  };
}
