import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { useAuth } from "./auth-context";

/**
 * Mirrors GET /api/analytics/portfolio/summary and /api/analytics/leads
 * (artifacts/api-server/src/routes/analytics.ts). Both are plan-gated: free
 * plans get `unlocked: false` with no totals rather than an error, and the
 * leads route returns 403 — the screens render an upsell for that, not a crash.
 */

export interface AnalyticsPoint {
  day: string;
  views: number;
  displayViews: number;
  uniquesApprox: number;
  leads: number;
}

export interface AnalyticsSummary {
  unlocked: boolean;
  days: number;
  message?: string;
  requiredPlans?: readonly string[];
  totals: {
    views: number;
    displayViews: number;
    uniquesApprox: number;
    leads: number;
    leadsUnread?: number;
    topReferrers: { host: string; count: number }[];
    devices: Record<string, number>;
  } | null;
  series: AnalyticsPoint[];
}

export interface Lead {
  id: string;
  senderName: string | null;
  senderEmail: string | null;
  senderPhone: string | null;
  message: string | null;
  handle: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface LeadsResponse {
  total: number;
  unread: number;
  leads: Lead[];
}

export function useAnalytics(days = 30) {
  const { status } = useAuth();
  return useQuery({
    queryKey: ["analytics", days],
    queryFn: () =>
      customFetch<AnalyticsSummary>(`/api/analytics/portfolio/summary?days=${days}`, {
        method: "GET",
      }),
    enabled: status === "signedIn",
  });
}

export function useLeads() {
  const { status } = useAuth();
  return useQuery({
    queryKey: ["leads"],
    queryFn: () => customFetch<LeadsResponse>("/api/analytics/leads", { method: "GET" }),
    enabled: status === "signedIn",
    // A 403 here means "plan doesn't include the inbox", which is a normal state
    // the screen renders — not something to keep retrying.
    retry: false,
  });
}

export interface LeadReply {
  id: string;
  subject: string | null;
  body: string;
  toEmail: string | null;
  toName: string | null;
  fromName: string | null;
  status: string;
  lastError: string | null;
  createdAt: string;
  sentAt: string | null;
}

export interface LeadThreadResponse {
  canReply: boolean;
  lead: Lead;
  replies: LeadReply[];
}

/** Mirrors GET /api/analytics/leads/:id/thread — 403 (PLAN_REQUIRED) means
 * in-app replies aren't on this plan, not a real error; screens should
 * still show the lead's own message, just without a reply box. */
export function useLeadThread(id: string | null) {
  const { status } = useAuth();
  return useQuery({
    queryKey: ["lead-thread", id],
    queryFn: () => customFetch<LeadThreadResponse>(`/api/analytics/leads/${id}/thread`, { method: "GET" }),
    enabled: status === "signedIn" && !!id,
    retry: false,
  });
}

export function useMarkLeadRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      customFetch<{ ok: boolean }>(`/api/analytics/leads/${id}/read`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
    },
  });
}

export function useReplyToLead(id: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: string) =>
      customFetch<{ ok: boolean }>(`/api/analytics/leads/${id}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lead-thread", id] });
    },
  });
}
