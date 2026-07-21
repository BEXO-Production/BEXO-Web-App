import { and, asc, eq, sql } from "drizzle-orm";
import { billingSettings, db, pricingCoupons, pricingPlans } from "@workspace/db";
import { normalizePlanId, type PaidPlan } from "./subscriptions";
import { logger } from "./logger";

export type PublicPlanId = "free" | "identity" | "essential" | "growth" | "studentplus" | "storage_addon";

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
  billingPeriod: "free" | "monthly" | "yearly" | "lifetime";
  razorpayPlanId: string | null;
  parsesPerMonth: number;
  updatesPerMonth: number;
};

export type PricingBreakdown = {
  base: number;
  discount: number;
  subtotal: number;
  gst: number;
  total: number;
  totalPaise: number;
  coupon: string | null;
  gstRate: number;
};

const MB = 1024 * 1024;

const FALLBACK_PLANS: PricingPlanRow[] = [
  {
    id: "free",
    displayName: "Free",
    subtitle: "Basic portfolio to prove the flow",
    priceInrExGst: 0,
    storageBytes: 10 * MB,
    isPurchasable: true,
    sortOrder: 0,
    isHighlighted: false,
    features: ["Basic template", "10MB storage", "1 update per month", "Path-based link (no subdomain)"],
    billingPeriod: "free",
    razorpayPlanId: null,
    parsesPerMonth: 0,
    updatesPerMonth: 1,
  },
  {
    id: "identity",
    displayName: "Identity Plan",
    subtitle: "Your professional identity, live",
    priceInrExGst: 59,
    storageBytes: 50 * MB,
    isPurchasable: true,
    sortOrder: 1,
    isHighlighted: false,
    features: [
      "yourname subdomain",
      "Premium templates",
      "50MB cloud storage",
      "1 AI resume parse / month",
      "3 updates / month",
      "Monthly invoice in dashboard",
    ],
    billingPeriod: "monthly",
    razorpayPlanId: null,
    parsesPerMonth: 1,
    updatesPerMonth: 3,
  },
  {
    id: "essential",
    displayName: "Essential Plan",
    subtitle: "Everything in Identity, more room to grow",
    priceInrExGst: 199,
    storageBytes: 100 * MB,
    isPurchasable: true,
    sortOrder: 2,
    isHighlighted: true,
    features: [
      "Everything in Identity",
      "100MB cloud storage",
      "3 AI resume parses / month",
      "10 updates / month",
      "Access to exclusive templates",
    ],
    billingPeriod: "monthly",
    razorpayPlanId: null,
    parsesPerMonth: 3,
    updatesPerMonth: 10,
  },
  {
    id: "growth",
    displayName: "Growth Plan",
    subtitle: "Essential, billed yearly",
    priceInrExGst: 999,
    storageBytes: 100 * MB,
    isPurchasable: true,
    sortOrder: 3,
    isHighlighted: false,
    features: [
      "Everything in Essential",
      "Billed once a year",
      "100MB cloud storage",
      "3 AI resume parses / month",
      "10 updates / month",
    ],
    billingPeriod: "yearly",
    razorpayPlanId: null,
    parsesPerMonth: 3,
    updatesPerMonth: 10,
  },
  {
    id: "studentplus",
    displayName: "Student+ Plan",
    subtitle: "Identity, forever - one payment",
    priceInrExGst: 1999,
    storageBytes: 50 * MB,
    isPurchasable: true,
    sortOrder: 4,
    isHighlighted: false,
    features: [
      "Everything in Identity",
      "One-time payment",
      "No renewals ever",
      "50MB cloud storage",
      "1 AI resume parse / month",
      "3 updates / month",
    ],
    billingPeriod: "lifetime",
    razorpayPlanId: null,
    parsesPerMonth: 1,
    updatesPerMonth: 3,
  },
  {
    id: "storage_addon",
    displayName: "Storage Increase",
    subtitle: "+50MB per block, billed monthly",
    priceInrExGst: 25,
    storageBytes: 50 * MB,
    isPurchasable: true,
    sortOrder: 99,
    isHighlighted: false,
    features: ["+50MB per block on top of your base plan", "Billed monthly via Razorpay Autopay", "Cancel anytime"],
    billingPeriod: "monthly",
    razorpayPlanId: null,
    parsesPerMonth: 0,
    updatesPerMonth: 0,
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
  const billingPeriod = ["free", "monthly", "yearly", "lifetime"].includes(row.billingPeriod)
    ? (row.billingPeriod as PricingPlanRow["billingPeriod"])
    : "yearly";
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
    billingPeriod,
    razorpayPlanId: row.razorpayPlanId || null,
    parsesPerMonth: Number(row.parsesPerMonth) || 0,
    updatesPerMonth: Number(row.updatesPerMonth) || 0,
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

export type PurchasableId = PaidPlan | "storage_addon";

export async function getPlanById(planId: string): Promise<PricingPlanRow | undefined> {
  const { plans } = await loadPricingCatalog();
  const direct = plans.find((p) => p.id === planId);
  if (direct) return direct;
  // Legacy ids map onto the new catalog
  const normalized = normalizePlanId(planId);
  if (normalized) return plans.find((p) => p.id === normalized);
  return undefined;
}

export async function getPlanPriceInr(plan: PurchasableId): Promise<number> {
  const row = await getPlanById(plan);
  if (row) return row.priceInrExGst;
  const fallback = FALLBACK_PLANS.find((p) => p.id === plan);
  return fallback?.priceInrExGst ?? 0;
}

export async function getPlanStorageBytes(plan: string): Promise<number> {
  const row = await getPlanById(plan);
  if (row) return row.storageBytes;
  return 10 * MB;
}

type CouponRow = typeof pricingCoupons.$inferSelect;

function couponIsValid(row: CouponRow, now = new Date()): boolean {
  if (!row.isActive) return false;
  if (row.validFrom && row.validFrom.getTime() > now.getTime()) return false;
  if (row.validUntil && row.validUntil.getTime() < now.getTime()) return false;
  if (row.maxUses != null && row.usedCount >= row.maxUses) return false;
  return true;
}

function discountFromCoupon(row: CouponRow, plan: PurchasableId, base: number): number {
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

/**
 * Paise-exact checkout math: GST is computed on paise so the charged amount
 * matches the Razorpay plan/order amount exactly (₹59 → ₹69.62 → 6962 paise).
 */
export async function calculatePlanAmount(
  plan: PurchasableId,
  couponCode?: string,
  quantity = 1,
): Promise<PricingBreakdown> {
  const { gstRate } = await loadPricingCatalog();
  const base = (await getPlanPriceInr(plan)) * Math.max(1, quantity);
  const couponRow = await findActiveCoupon(couponCode);
  const discount = couponRow ? discountFromCoupon(couponRow, plan, base) : 0;
  const subtotal = Math.max(base - discount, 0);
  const subtotalPaise = Math.round(subtotal * 100);
  const gstPaise = Math.round(subtotalPaise * gstRate);
  const totalPaise = subtotalPaise + gstPaise;

  return {
    base,
    discount,
    subtotal,
    gst: gstPaise / 100,
    total: totalPaise / 100,
    totalPaise,
    coupon: couponRow ? couponRow.code.toUpperCase() : null,
    gstRate,
  };
}

export async function validateCouponForPlan(
  couponCode: string,
  plan: PurchasableId,
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
  // list price already matches (discount 0).
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

export async function toPublicPricingPayload(catalog: Awaited<ReturnType<typeof loadPricingCatalog>>) {
  const plans = await Promise.all(
    catalog.plans.map(async (p) => ({
      id: p.id,
      displayName: p.displayName,
      subtitle: p.subtitle,
      priceInrExGst: p.priceInrExGst,
      storageBytes: p.storageBytes,
      isPurchasable: p.isPurchasable,
      isHighlighted: p.isHighlighted,
      features: p.features,
      billingPeriod: p.billingPeriod,
      parsesPerMonth: p.parsesPerMonth,
      updatesPerMonth: p.updatesPerMonth,
      sortOrder: p.sortOrder,
      pricing:
        p.priceInrExGst > 0 && p.isPurchasable
          ? await calculatePlanAmount(p.id as PurchasableId)
          : null,
    })),
  );
  return {
    currency: catalog.currency,
    gstRate: catalog.gstRate,
    plans,
  };
}
