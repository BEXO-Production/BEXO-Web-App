/** Canonical BEXO pricing + storage quotas (frontend). Keep in sync with api-server pricingCatalog. */

export const FREE_STORAGE_BYTES = 10 * 1024 * 1024; // 10MB
export const IDENTITY_STORAGE_BYTES = 50 * 1024 * 1024; // 50MB (Identity / Student+)
export const ESSENTIAL_STORAGE_BYTES = 100 * 1024 * 1024; // 100MB (Essential / Growth)
export const STORAGE_BLOCK_BYTES = 50 * 1024 * 1024; // storage add-on block

// Legacy aliases still referenced by older components
export const ANNUAL_STORAGE_BYTES = ESSENTIAL_STORAGE_BYTES;
export const LIFETIME_STORAGE_BYTES = IDENTITY_STORAGE_BYTES;

/** Prices in INR, exclusive of GST (18% added at checkout). Fallbacks if /api/pricing is unavailable. */
export const PLAN_PRICES_INR = {
  identity: 59,
  essential: 199,
  growth: 999,
  studentplus: 1999,
  storage_addon: 25,
} as const;

export type PlanPricesInr = {
  identity: number;
  essential: number;
  growth: number;
  studentplus: number;
  storage_addon: number;
};

export const PLAN_LABELS: Record<string, string> = {
  free: "Free",
  identity: "Identity",
  essential: "Essential",
  growth: "Growth",
  studentplus: "Student+",
  storage_addon: "Storage Increase",
  // legacy ids map to the new names
  annual: "Growth",
  lifetime: "Student+",
};

export const BILLING_PERIOD_LABELS: Record<string, string> = {
  monthly: "/month",
  yearly: "/year",
  lifetime: " one-time",
  free: "",
};

export function formatMb(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return Number.isInteger(mb) ? `${mb}MB` : `${mb.toFixed(1)}MB`;
}

export function planBaseQuotaBytes(plan: string | null | undefined): number {
  if (plan === "essential" || plan === "growth" || plan === "annual") return ESSENTIAL_STORAGE_BYTES;
  if (plan === "identity" || plan === "studentplus" || plan === "lifetime") return IDENTITY_STORAGE_BYTES;
  return FREE_STORAGE_BYTES;
}

/** Offline fallback catalog (mirrors pricing_plans rows). */
export const FALLBACK_PLAN_CATALOG = [
  {
    id: "free" as const,
    displayName: "Free",
    subtitle: "Basic portfolio to prove the flow",
    priceInrExGst: 0,
    storageBytes: FREE_STORAGE_BYTES,
    isPurchasable: true,
    isHighlighted: false,
    features: ["Basic template", "10MB storage", "1 update per month", "Path-based link (no subdomain)"],
    billingPeriod: "free" as const,
    parsesPerMonth: 0,
    updatesPerMonth: 1,
    sortOrder: 0,
    pricing: null,
  },
  {
    id: "identity" as const,
    displayName: "Identity Plan",
    subtitle: "Your professional identity, live",
    priceInrExGst: 59,
    storageBytes: IDENTITY_STORAGE_BYTES,
    isPurchasable: true,
    isHighlighted: false,
    features: [
      "yourname subdomain",
      "Premium templates",
      "50MB cloud storage",
      "1 AI resume parse / month",
      "3 updates / month",
      "Monthly invoice in dashboard",
    ],
    billingPeriod: "monthly" as const,
    parsesPerMonth: 1,
    updatesPerMonth: 3,
    sortOrder: 1,
    pricing: null,
  },
  {
    id: "essential" as const,
    displayName: "Essential Plan",
    subtitle: "Everything in Identity, more room to grow",
    priceInrExGst: 199,
    storageBytes: ESSENTIAL_STORAGE_BYTES,
    isPurchasable: true,
    isHighlighted: true,
    features: [
      "Everything in Identity",
      "100MB cloud storage",
      "3 AI resume parses / month",
      "10 updates / month",
      "Access to exclusive templates",
    ],
    billingPeriod: "monthly" as const,
    parsesPerMonth: 3,
    updatesPerMonth: 10,
    sortOrder: 2,
    pricing: null,
  },
  {
    id: "growth" as const,
    displayName: "Growth Plan",
    subtitle: "Essential, billed yearly",
    priceInrExGst: 999,
    storageBytes: ESSENTIAL_STORAGE_BYTES,
    isPurchasable: true,
    isHighlighted: false,
    features: [
      "Everything in Essential",
      "Billed once a year",
      "100MB cloud storage",
      "3 AI resume parses / month",
      "10 updates / month",
    ],
    billingPeriod: "yearly" as const,
    parsesPerMonth: 3,
    updatesPerMonth: 10,
    sortOrder: 3,
    pricing: null,
  },
  {
    id: "studentplus" as const,
    displayName: "Student+ Plan",
    subtitle: "Identity, forever - one payment",
    priceInrExGst: 1999,
    storageBytes: IDENTITY_STORAGE_BYTES,
    isPurchasable: true,
    isHighlighted: false,
    features: [
      "Everything in Identity",
      "One-time payment",
      "No renewals ever",
      "50MB cloud storage",
      "1 AI resume parse / month",
      "3 updates / month",
    ],
    billingPeriod: "lifetime" as const,
    parsesPerMonth: 1,
    updatesPerMonth: 3,
    sortOrder: 4,
    pricing: null,
  },
  {
    id: "storage_addon" as const,
    displayName: "Storage Increase",
    subtitle: "+50MB per block, billed monthly",
    priceInrExGst: 25,
    storageBytes: STORAGE_BLOCK_BYTES,
    isPurchasable: true,
    isHighlighted: false,
    features: ["+50MB per block on top of your base plan", "Billed monthly via Razorpay Autopay", "Cancel anytime"],
    billingPeriod: "monthly" as const,
    parsesPerMonth: 0,
    updatesPerMonth: 0,
    sortOrder: 99,
    pricing: null,
  },
];
