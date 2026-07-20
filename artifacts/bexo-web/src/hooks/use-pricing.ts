import { useEffect, useState } from "react";
import {
  ANNUAL_STORAGE_BYTES,
  FREE_STORAGE_BYTES,
  LIFETIME_STORAGE_BYTES,
  PLAN_PRICES_INR,
  type PlanPricesInr,
} from "@/lib/pricing";

export type PublicPricingPlan = {
  id: "free" | "annual" | "lifetime";
  displayName: string;
  subtitle: string | null;
  priceInrExGst: number;
  storageBytes: number;
  isPurchasable: boolean;
  isHighlighted: boolean;
  features: string[];
};

export type PricingApiResponse = {
  currency: string;
  gstRate: number;
  plans: PublicPricingPlan[];
};

const FALLBACK: PricingApiResponse = {
  currency: "INR",
  gstRate: 0.18,
  plans: [
    {
      id: "free",
      displayName: "Free",
      subtitle: null,
      priceInrExGst: 0,
      storageBytes: FREE_STORAGE_BYTES,
      isPurchasable: true,
      isHighlighted: false,
      features: [],
    },
    {
      id: "annual",
      displayName: "Yearly",
      subtitle: null,
      priceInrExGst: PLAN_PRICES_INR.annual,
      storageBytes: ANNUAL_STORAGE_BYTES,
      isPurchasable: true,
      isHighlighted: true,
      features: [],
    },
    {
      id: "lifetime",
      displayName: "Lifetime",
      subtitle: null,
      priceInrExGst: PLAN_PRICES_INR.lifetime,
      storageBytes: LIFETIME_STORAGE_BYTES,
      isPurchasable: true,
      isHighlighted: false,
      features: [],
    },
  ],
};

export function plansToPriceMap(plans: PublicPricingPlan[]): PlanPricesInr {
  const annual = plans.find((p) => p.id === "annual")?.priceInrExGst ?? PLAN_PRICES_INR.annual;
  const lifetime = plans.find((p) => p.id === "lifetime")?.priceInrExGst ?? PLAN_PRICES_INR.lifetime;
  return { annual, lifetime };
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
          setData(json);
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
  const planById = (id: PublicPricingPlan["id"]) => data.plans.find((p) => p.id === id);

  return { ...data, loading, prices, planById };
}

export async function validateCouponApi(plan: "annual" | "lifetime", couponCode: string) {
  const res = await fetch("/api/pricing/validate-coupon", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ plan, couponCode }),
  });
  return res.json() as Promise<{
    valid: boolean;
    message?: string;
    coupon?: string;
    pricing?: {
      base: number;
      discount: number;
      subtotal: number;
      gst: number;
      total: number;
      coupon: string | null;
      gstRate: number;
    };
  }>;
}
