import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { clearAccessToken, getAccessToken, setAccessToken } from "./storage";
import { verifyWidgetToken } from "./auth-api";
import { setUnauthenticatedHandler } from "./query-client";

type AuthStatus = "loading" | "signedOut" | "signedIn";

interface AuthContextValue {
  status: AuthStatus;
  hasCompletedOnboarding: boolean;
  /** Confirms an MSG91 widget access token server-side and starts the session.
   * OTP send/retry/verify against MSG91 itself happens before this — see
   * app/(auth)/phone.tsx and verify.tsx, via src/lib/msg91-bridge.ts. */
  confirmWidgetToken: (widgetToken: string) => Promise<{ hasCompletedOnboarding: boolean }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    getAccessToken().then((token) => {
      setStatus(token ? "signedIn" : "signedOut");
    });
  }, []);

  // Any query returning 401 means the token is dead server-side; drop the whole
  // app to signed-out rather than leaving screens stuck on unloadable data.
  useEffect(() => {
    setUnauthenticatedHandler(() => {
      clearAccessToken().finally(() => {
        queryClient.clear();
        setStatus("signedOut");
        router.replace("/(auth)/phone");
      });
    });
    return () => setUnauthenticatedHandler(null);
  }, [queryClient]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      hasCompletedOnboarding,
      async confirmWidgetToken(widgetToken: string) {
        const result = await verifyWidgetToken(widgetToken);
        await setAccessToken(result.accessToken);
        setHasCompletedOnboarding(result.hasCompletedOnboarding);
        setStatus("signedIn");
        return { hasCompletedOnboarding: result.hasCompletedOnboarding };
      },
      async signOut() {
        await clearAccessToken();
        queryClient.clear();
        setStatus("signedOut");
        router.replace("/(auth)/phone");
      },
    }),
    [status, hasCompletedOnboarding, queryClient],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
