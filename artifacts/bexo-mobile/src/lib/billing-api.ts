import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { useAuth } from "./auth-context";

export interface PaymentRecord {
  id: string;
  plan: string;
  kind?: string;
  amount: number; // in paise
  status: "success" | "pending" | "failed" | "refunded" | string;
  invoiceUrl: string | null;
  razorpayOrderId?: string | null;
  razorpaySubscriptionId?: string | null;
  razorpayPaymentId?: string | null;
  createdAt: string;
}

export interface BillingProfileData {
  legalName?: string | null;
  gstin?: string | null;
  addressLine1?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
}

export interface StorageAddonInfo {
  blocks: number;
  rowBlocks?: number;
  status: string;
  currentEnd: string | null;
  hasAutopay: boolean;
  grantingBlocks: number;
  autopay: boolean;
}

export interface PlanLimits {
  parsesPerMonth: number;
  updatesPerMonth: number;
  updatesUsed: number;
  updatesRemaining: number;
  updatesDaysToReset: number;
  parsesUsed: number;
  parsesRemaining: number;
  parsesDaysToReset: number;
}

export interface PricingPlanItem {
  id: string;
  name: string;
  tagline?: string;
  amountPaise: number;
  billingPeriod: "monthly" | "annual" | "lifetime";
  features?: string[];
  popular?: boolean;
}

export interface BillingStatusResponse {
  plan: string;
  status: string;
  isPremium: boolean;
  expiresAt: string | null;
  billingPeriod: string | null;
  storageQuotaBytes: number;
  storageBonusBytes?: number;
  effectiveQuotaBytes: number;
  storageUsedBytes: number;
  overStorage: boolean;
  siteStatus?: string;
  pauseReason?: string | null;
  graceUntil?: string | null;
  cancelAtPeriodEnd: boolean;
  paymentFailedAt?: string | null;
  isInPaymentGrace: boolean;
  isPausedForVisitors: boolean;
  addonBlocks: number;
  addonBytes: number;
  addonHasAutopay: boolean;
  addon: StorageAddonInfo | null;
  limits: PlanLimits;
  canBuy: boolean;
  renewalMode?: string;
  autopay: boolean;
  autopayMethod?: "upi_mandate" | "razorpay_subscription" | null;
  canEnableAutopay?: boolean;
  needsMandateSetup?: boolean;
  payments: PaymentRecord[];
  pricing?: {
    plans?: Record<string, any>;
    storageAddon?: {
      blockSizeMb: number;
      pricePaise: number;
      maxBlocks: number;
    };
  };
  billingProfile?: BillingProfileData | null;
}

/** Fetch full billing, subscription, addon, and invoice status */
export function useBillingStatus() {
  const { status } = useAuth();
  return useQuery({
    queryKey: ["billing-status"],
    queryFn: () => customFetch<BillingStatusResponse>("/api/payments/status", { method: "GET" }),
    enabled: status === "signedIn",
    staleTime: 15_000,
  });
}

/** Update tax / billing profile */
export function useUpdateBillingProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (profile: BillingProfileData) =>
      customFetch<{ ok: boolean; profile: BillingProfileData }>("/api/payments/billing-profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["billing-status"] });
    },
  });
}

/** Cancel recurring subscription at period end */
export function useCancelSubscription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      customFetch<{ ok: boolean; message: string; cancelAtPeriodEnd: boolean }>(
        "/api/payments/subscription/cancel",
        { method: "POST" }
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["billing-status"] });
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
  });
}

/** Cancel storage addon */
export function useCancelAddon() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      customFetch<{ ok: boolean; message: string }>("/api/payments/addon/cancel", {
        method: "POST",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["billing-status"] });
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
  });
}

/** Purchase / activate storage addon blocks */
export function useCreateAddonSubscription() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (variables: { blocks: number }) =>
      customFetch<any>("/api/payments/create-addon-subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blocks: variables.blocks }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["billing-status"] });
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
  });
}
