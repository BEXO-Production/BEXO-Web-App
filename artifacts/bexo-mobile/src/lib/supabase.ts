import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

/**
 * The same Supabase project bexo-web uses (see artifacts/bexo-web/.env) —
 * this is only ever an OAuth broker here, never a data store. Mobile talks
 * to Postgres exclusively through artifacts/api-server, same as web; the
 * only thing that touches this client is the Google sign-in handshake in
 * src/lib/google-auth.ts, whose result gets handed to the server's
 * POST /api/profile/link-google (see profile.ts) to link the identity onto
 * the already phone-verified BEXO account.
 */
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY are not set — Google sign-in will fail. See .env.example.",
  );
}

// expo-router's web target statically prerenders routes in a Node context —
// `typeof window` is `"undefined"` there (true SSR), but `"object"` both in a
// real browser and on native (RN aliases `window` to globalThis). createClient
// eagerly loads a session on construction, and AsyncStorage's web shim reaches
// for `window.localStorage` to do it — which crashed the entire prerender with
// "window is not defined" before this guard existed. A no-op stub during that
// one Node pass is fine: no real session exists to restore there anyway.
const isSsr = typeof window === "undefined";
const storage = isSsr
  ? {
      getItem: async () => null,
      setItem: async () => {},
      removeItem: async () => {},
    }
  : AsyncStorage;

export const supabase = createClient(supabaseUrl ?? "", supabaseAnonKey ?? "", {
  auth: {
    storage,
    autoRefreshToken: !isSsr,
    persistSession: !isSsr,
    detectSessionInUrl: false,
    // PKCE is the flow Supabase recommends for native apps — the auth code
    // is exchanged for a session locally rather than a token ever appearing
    // in a redirect URL a mobile OS could log or intercept.
    flowType: "pkce",
  },
});
