import { ApiError } from "@workspace/api-client-react";

export interface DescribedError {
  title: string;
  message: string;
  /** Correlation id from the API (X-Request-Id header or problem body) — shown to users for support. */
  requestId?: string;
  isOffline: boolean;
  /** True when the session is gone and the user must sign in again. */
  isUnauthenticated: boolean;
}

/** The server's problem+json envelope (see api-server/src/middlewares/errorHandler.ts). */
interface ProblemBody {
  title?: string;
  detail?: string;
  code?: string;
  requestId?: string;
  error?: string;
}

function looksOffline(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /network request failed|load failed|failed to fetch|networkerror|timeout|abort/i.test(
    message,
  );
}

/**
 * Single place that decides what a user reads when something fails.
 * Everything else in the app renders the result — no ad-hoc error strings.
 */
export function describeError(error: unknown): DescribedError {
  if (error instanceof ApiError) {
    const body = (error.data ?? {}) as ProblemBody;
    const requestId = error.headers?.get("x-request-id") ?? body.requestId;
    const detail = body.detail ?? body.error;

    if (error.status === 401) {
      return {
        title: "Session expired",
        message: "Please sign in again to continue.",
        requestId,
        isOffline: false,
        isUnauthenticated: true,
      };
    }

    if (error.status === 429) {
      return {
        title: "Slow down a moment",
        message: detail ?? "You've made too many attempts. Wait a minute and try again.",
        requestId,
        isOffline: false,
        isUnauthenticated: false,
      };
    }

    if (error.status >= 500) {
      return {
        title: "Something went wrong",
        message:
          detail ?? "This is on our side, not yours. Please try again in a moment.",
        requestId,
        isOffline: false,
        isUnauthenticated: false,
      };
    }

    return {
      title: body.title ?? "That didn't work",
      message: detail ?? "Please check your details and try again.",
      requestId,
      isOffline: false,
      isUnauthenticated: false,
    };
  }

  if (looksOffline(error)) {
    return {
      title: "No connection",
      message: "We couldn't reach BEXO. Check your internet connection and try again.",
      isOffline: true,
      isUnauthenticated: false,
    };
  }

  // Our own thrown errors (MSG91 bridge, Google linking, etc.) carry a
  // real, already-user-facing message — surface it instead of masking it
  // with a generic string that makes every distinct failure look identical.
  if (error instanceof Error && error.message) {
    return {
      title: "Something went wrong",
      message: error.message,
      isOffline: false,
      isUnauthenticated: false,
    };
  }

  return {
    title: "Something went wrong",
    message: "An unexpected error occurred. Please try again.",
    isOffline: false,
    isUnauthenticated: false,
  };
}
