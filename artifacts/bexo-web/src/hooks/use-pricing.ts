import { useEffect, useState } from "react";
import { FALLBACK_PLAN_CATALOG, PLAN_PRICES_INR, type PlanPricesInr } from "@/lib/pricing";

export type PublicPlanId = "free" | "identity" | "essential" | "growth" | "studentplus" | "storage_addon";

export type PricingBreakdown = {
  base: number;
  discount: number;
  subtotal: number;
  gst: number;
  total: number;
  totalPaise?: number;
  coupon: string | null;
  gstRate: number;
};

export type PublicPricingPlan = {
  id: PublicPlanId;
  displayName: string;
  subtitle: string | null;
  priceInrExGst: number;
  storageBytes: number;
  isPurchasable: boolean;
  isHighlighted: boolean;
  features: string[];
  billingPeriod: "free" | "monthly" | "yearly" | "lifetime";
  parsesPerMonth?: number;
  updatesPerMonth?: number;
  sortOrder?: number;
  pricing?: PricingBreakdown | null;
};

export type PricingApiResponse = {
  currency: string;
  gstRate: number;
  plans: PublicPricingPlan[];
};

const FALLBACK: PricingApiResponse = {
  currency: "INR",
  gstRate: 0.18,
  plans: FALLBACK_PLAN_CATALOG,
};

export function plansToPriceMap(plans: PublicPricingPlan[]): PlanPricesInr {
  const price = (id: PublicPlanId, fallback: number) =>
    plans.find((p) => p.id === id)?.priceInrExGst ?? fallback;
  return {
    identity: price("identity", PLAN_PRICES_INR.identity),
    essential: price("essential", PLAN_PRICES_INR.essential),
    growth: price("growth", PLAN_PRICES_INR.growth),
    studentplus: price("studentplus", PLAN_PRICES_INR.studentplus),
    storage_addon: price("storage_addon", PLAN_PRICES_INR.storage_addon),
  };
}

export function usePricing() {
  const [data, setData] = useState<PricingApiResponse>(FALLBACK);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/pricing");
        if (!res.ok) throw new Error("pricing fetch failed");
        const json = (await res.json()) as PricingApiResponse;
        if (!cancelled && Array.isArray(json.plans) && json.plans.length > 0) {
          // Only accept the new catalog shape; legacy annual/lifetime payloads fall back
          const hasNewCatalog = json.plans.some((p) => p.id === "identity" || p.id === "growth");
          setData(hasNewCatalog ? json : FALLBACK);
        }
      } catch {
        if (!cancelled) setData(FALLBACK);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const prices = plansToPriceMap(data.plans);
  const planById = (id: PublicPlanId | string) => data.plans.find((p) => p.id === id);
  /** Paid base plans in display order (excludes free + storage add-on). */
  const paidPlans = data.plans
    .filter((p) => p.isPurchasable && p.priceInrExGst > 0 && p.id !== "storage_addon")
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  return { ...data, loading, prices, planById, paidPlans };
}

export async function validateCouponApi(plan: string, couponCode: string) {
  const res = await fetch("/api/pricing/validate-coupon", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ plan, couponCode }),
  });
  return res.json() as Promise<{
    valid: boolean;
    message?: string;
    coupon?: string;
    pricing?: PricingBreakdown;
  }>;
}
