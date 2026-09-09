import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { useAuth } from "./auth-context";

/**
 * The connection graph — `artifacts/api-server/src/routes/connections.ts`.
 *
 * A BEXO card's QR encodes a URL ending in the owner's card code. Scanning one
 * resolves who it belongs to, records the scan, and opens a connection request
 * in a single call, so the scanner immediately knows both who they met and
 * where that person's site is.
 */

export interface ConnectionPerson {
  id: string;
  name: string | null;
  photoUrl: string | null;
  cardCode: string;
  handle: string | null;
  headline: string | null;
  siteUrl: string | null;
}

export interface ConnectionEdge {
  id: string;
  status: "pending" | "accepted" | "declined";
  source: string;
  /** True when they scanned us and are waiting on our answer. */
  incoming: boolean;
  connectedSince: string;
  mutuals: number;
  person: ConnectionPerson;
}

export interface ScanResult {
  person: ConnectionPerson;
  isSelf: boolean;
  connection: { id: string; status: "pending" | "accepted" | "declined"; incoming: boolean } | null;
  /** Set when the scan completed a handshake — both people scanned each other. */
  mutual?: boolean;
  autoConnected?: boolean;
}

export function useConnections() {
  const { status } = useAuth();
  return useQuery({
    queryKey: ["connections"],
    queryFn: () => customFetch<{ connections: ConnectionEdge[] }>("/api/connections", { method: "GET" }),
    enabled: status === "signedIn",
    staleTime: 5_000,
    refetchInterval: 8_000,
  });
}

export function useScanCard() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { code: string; source?: "qr" | "nfc" | "link" | "manual" }) =>
      customFetch<ScanResult>("/api/connections/scan", {
        method: "POST",
        body: JSON.stringify({ code: input.code, source: input.source ?? "qr" }),
      }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["connections"] });
    },
  });
}

export function useRespondToConnection() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; action: "accept" | "decline" }) =>
      customFetch<{ id: string; status: string }>(`/api/connections/${input.id}/respond`, {
        method: "POST",
        body: JSON.stringify({ action: input.action }),
      }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["connections"] });
    },
  });
}

/** Initials for an avatar, from whatever name we actually have. */
export function personInitials(person: Pick<ConnectionPerson, "name" | "handle">): string {
  const source = person.name?.trim() || person.handle || "";
  if (!source) return "··";
  const parts = source.split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || source.slice(0, 2).toUpperCase();
}

/**
 * Colour a connection by how it came about, so the graph still reads as
 * clustered without asking anyone to categorise their contacts by hand.
 */
export const CONNECTION_COLORS: Record<string, string> = {
  qr: "#5B8CFF",
  nfc: "#34D399",
  link: "#C4B5FD",
  manual: "#FDA4AF",
};

export function connectionColor(edge: { source: string }): string {
  return CONNECTION_COLORS[edge.source] ?? CONNECTION_COLORS.qr;
}
