import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { supabase } from "./supabase";

WebBrowser.maybeCompleteAuthSession();

export interface GoogleSignInResult {
  supabaseAccessToken: string;
  email: string | null;
  name: string | null;
}

/**
 * Google sign-in via Supabase's OAuth broker, using the same PKCE dance
 * Supabase recommends for Expo: ask Supabase for the Google consent URL,
 * open it in the OS browser (not a WebView — Google blocks OAuth inside
 * embedded WebViews), catch the `bexo://auth-callback` redirect, then
 * exchange the returned code for a session locally.
 *
 * Requires two things set up in the Supabase dashboard, not in this code:
 * the Google provider enabled (Authentication → Providers → Google, with a
 * Google Cloud OAuth client id/secret), and `bexo://auth-callback` added to
 * Authentication → URL Configuration → Redirect URLs.
 */
export async function signInWithGoogle(): Promise<GoogleSignInResult> {
  const redirectTo = Linking.createURL("auth-callback");

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error || !data.url) {
    throw new Error(error?.message ?? "Could not start Google sign-in.");
  }

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== "success" || !result.url) {
    throw new Error(result.type === "cancel" ? "Sign-in was cancelled." : "Google sign-in failed.");
  }

  const params = new URL(result.url).searchParams;
  const code = params.get("code");
  if (!code) {
    throw new Error(params.get("error_description") ?? "Google sign-in did not return a code.");
  }

  const { data: sessionData, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError || !sessionData.session) {
    throw new Error(exchangeError?.message ?? "Could not complete Google sign-in.");
  }

  const { session } = sessionData;
  return {
    supabaseAccessToken: session.access_token,
    email: session.user.email ?? null,
    name:
      (session.user.user_metadata?.full_name as string | undefined) ??
      (session.user.user_metadata?.name as string | undefined) ??
      null,
  };
}
