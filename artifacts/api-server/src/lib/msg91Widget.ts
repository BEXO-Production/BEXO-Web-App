import { logger } from "./logger";

/**
 * Server-side half of the MSG91 OTP Widget flow. The client (web widget or
 * the mobile WebView wrapper) sends/retries/verifies the OTP itself via
 * MSG91 directly — SMS as the primary channel, WhatsApp as fallback, per the
 * widget's own Channels Configuration — and hands us back a short-lived
 * widget access token on success. We never see the OTP code itself; we only
 * confirm that token is real before trusting the phone number it names.
 *
 * Endpoint confirmed from the account's own "Server Side Integration" tab:
 *   POST https://control.msg91.com/api/v5/widget/verifyAccessToken
 *   { authkey, "access-token" } -> { type: "success" | "error", message }
 * On success `message` is the verified identifier (phone number, no `+`).
 */
const VERIFY_URL = "https://control.msg91.com/api/v5/widget/verifyAccessToken";

export interface WidgetVerifyResult {
  verified: boolean;
  /** The verified phone number MSG91 reports back, digits only (e.g. "919876543210"). */
  identifier?: string;
  error?: string;
}

export async function verifyWidgetAccessToken(widgetToken: string): Promise<WidgetVerifyResult> {
  const authkey = process.env.MSG91_AUTH_KEY;
  if (!authkey || authkey === "your_msg91_auth_key") {
    logger.error("MSG91_AUTH_KEY is not configured — cannot verify widget tokens");
    return { verified: false, error: "OTP verification is temporarily unavailable." };
  }

  let response: Response;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      response = await fetch(VERIFY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authkey, "access-token": widgetToken }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  } catch (err) {
    logger.error({ err }, "MSG91 verifyAccessToken request failed");
    return { verified: false, error: "Could not reach the verification service. Try again." };
  }

  const raw = await response.text();
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    logger.error({ raw, status: response.status }, "MSG91 verifyAccessToken returned non-JSON");
    return { verified: false, error: "Verification service returned an unexpected response." };
  }

  // Log the raw shape at info level for the first few real calls — MSG91's
  // docs don't spell out every field, so this is how we confirm/adjust the
  // parsing below against a real response instead of guessing twice.
  logger.info({ status: response.status, data }, "MSG91 verifyAccessToken response");

  const body = data as Record<string, unknown>;
  const type = typeof body.type === "string" ? body.type.toLowerCase() : "";
  const message = typeof body.message === "string" ? body.message : undefined;

  if (!response.ok || type === "error") {
    return { verified: false, error: message || "That verification code is invalid or expired." };
  }

  // Success shape observed across MSG91's widget APIs is `{ type: "success", message: <identifier> }`.
  // Some accounts nest it under `data`/`identifier` instead — check those too before giving up.
  const identifier =
    message ??
    (typeof body.identifier === "string" ? body.identifier : undefined) ??
    (typeof (body.data as Record<string, unknown> | undefined)?.identifier === "string"
      ? ((body.data as Record<string, unknown>).identifier as string)
      : undefined);

  if (!identifier) {
    logger.error({ data }, "MSG91 verifyAccessToken succeeded but no identifier field was recognized");
    return { verified: false, error: "Verification succeeded but the response was unrecognized." };
  }

  return { verified: true, identifier: identifier.replace(/\D/g, "") };
}
