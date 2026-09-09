import { QueryCache, QueryClient } from "@tanstack/react-query";
import { describeError } from "./errors";

/**
 * Registered by AuthProvider. Any query that comes back 401 means the JWT is
 * gone or expired server-side, so the whole app must drop to signed-out rather
 * than each screen handling it — otherwise a stale token leaves the user on a
 * shell that can never load data.
 */
let onUnauthenticated: (() => void) | null = null;

export function setUnauthenticatedHandler(handler: (() => void) | null): void {
  onUnauthenticated = handler;
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError(error) {
      if (describeError(error).isUnauthenticated) onUnauthenticated?.();
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // Retrying a 4xx just burns battery and rate limit — the request was wrong,
      // not unlucky. Server faults and network blips are worth one retry.
      retry(failureCount, error) {
        const { isUnauthenticated } = describeError(error);
        if (isUnauthenticated) return false;
        const status = (error as { status?: number })?.status;
        if (typeof status === "number" && status >= 400 && status < 500) return false;
        return failureCount < 2;
      },
    },
  },
});
