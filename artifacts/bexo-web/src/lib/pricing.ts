/** Canonical BEXO pricing + storage quotas (frontend). Keep in sync with api-server subscriptions + payments. */

export const FREE_STORAGE_BYTES = 10 * 1024 * 1024; // 10MB
export const ANNUAL_STORAGE_BYTES = 100 * 1024 * 1024; // 100MB base (Yearly)
export const LIFETIME_STORAGE_BYTES = 500 * 1024 * 1024; // 500MB base (Lifetime) — stack Yearly for +100MB


/** Prices in INR, exclusive of GST (18% added at checkout). */
export const PLAN_PRICES_INR = {
  annual: 1499,
  lifetime: 2999,
} as const;

export const PLAN_LABELS = {
  free: "Free",
  annual: "Yearly",
  lifetime: "Lifetime",
} as const;

export function formatMb(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return Number.isInteger(mb) ? `${mb}MB` : `${mb.toFixed(1)}MB`;
}

export function planBaseQuotaBytes(plan: "free" | "annual" | "lifetime" | null | undefined): number {
  if (plan === "annual") return ANNUAL_STORAGE_BYTES;
  if (plan === "lifetime") return LIFETIME_STORAGE_BYTES;
  return FREE_STORAGE_BYTES;
}
