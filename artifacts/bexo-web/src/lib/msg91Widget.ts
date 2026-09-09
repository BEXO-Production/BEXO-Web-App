/**
 * MSG91 OTP Widget, custom-UI mode: `exposeMethods: true` suppresses the
 * widget's own popup entirely and exposes sendOtp/retryOtp/verifyOtp on
 * `window` instead, so login.tsx / step-1.tsx keep their own branded phone +
 * OTP-box UI and just swap what happens on submit.
 *
 * MSG91 generates, delivers (SMS primary, WhatsApp fallback — Channels
 * Configuration in the dashboard, not here) and verifies the OTP itself; the
 * only thing that crosses into our code is the short-lived widget access
 * token from verifyOtp's success callback, which the caller must then send
 * to POST /api/auth/phone/widget-verify for server-side confirmation before
 * trusting it — this module never mints a session by itself.
 */
const WIDGET_ID = import.meta.env.VITE_MSG91_WIDGET_ID as string | undefined;
const TOKEN_AUTH = import.meta.env.VITE_MSG91_WIDGET_TOKEN_AUTH as string | undefined;
const SCRIPT_SRC = "https://verify.msg91.com/otp-provider.js";
const SCRIPT_ID = "msg91-otp-provider";

declare global {
  interface Window {
    initSendOTP?: (config: unknown) => void;
    sendOtp?: (
      identifier: string,
      success?: (data: unknown) => void,
      failure?: (error: unknown) => void,
    ) => void;
    retryOtp?: (
      channel: string | null,
      success?: (data: unknown) => void,
      failure?: (error: unknown) => void,
      reqId?: string,
    ) => void;
    verifyOtp?: (
      otp: string | number,
      success?: (data: unknown) => void,
      failure?: (error: unknown) => void,
      reqId?: string,
    ) => void;
  }
}

function devLog(label: string, data: unknown): void {
  // MSG91's docs don't give a concrete success/failure JSON shape for these
  // three methods, unlike the server API we already confirmed live. Keeping
  // this until the first real send/verify has been watched once — same
  // approach that caught the server's exact `{message,type,code}` shape.
  if (import.meta.env.DEV) console.log(`[msg91] ${label}`, data);
}

let scriptLoadPromise: Promise<void> | null = null;

function loadAndInit(): Promise<void> {
  if (scriptLoadPromise) return scriptLoadPromise;

  scriptLoadPromise = new Promise((resolve, reject) => {
    if (!WIDGET_ID || !TOKEN_AUTH) {
      reject(
        new Error(
          "Verification isn't configured yet (missing VITE_MSG91_WIDGET_ID / VITE_MSG91_WIDGET_TOKEN_AUTH).",
        ),
      );
      return;
    }

    const configuration = {
      widgetId: WIDGET_ID,
      tokenAuth: TOKEN_AUTH,
      exposeMethods: true,
      captchaRenderId: "",
      success: (data: unknown) => devLog("default success callback (ignored — verifyOtp's own callback is used instead)", data),
      failure: (error: unknown) => devLog("default failure callback (ignored — verifyOtp's own callback is used instead)", error),
    };

    if (document.getElementById(SCRIPT_ID)) {
      window.initSendOTP?.(configuration);
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => {
      try {
        window.initSendOTP?.(configuration);
        resolve();
      } catch (err) {
        reject(err instanceof Error ? err : new Error("Failed to start the verification widget."));
      }
    };
    script.onerror = () => {
      scriptLoadPromise = null; // allow retry on the next call
      reject(new Error("Could not load the verification script. Check your connection and try again."));
    };
    document.body.appendChild(script);
  });

  return scriptLoadPromise;
}

/** initSendOTP's setup finishes asynchronously after the script's onload fires. */
async function ensureReady(): Promise<void> {
  await loadAndInit();
  for (let i = 0; i < 30 && !(window.sendOtp && window.verifyOtp); i++) {
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!window.sendOtp || !window.verifyOtp) {
    throw new Error("Verification widget didn't finish loading. Please refresh and try again.");
  }
}

function errorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === "object" && "message" in error && typeof (error as { message: unknown }).message === "string") {
    return (error as { message: string }).message;
  }
  return fallback;
}

export interface WidgetSendResult {
  /** Needed by retryWidgetOtp/verifyWidgetOtp when a page might run more than one verification in a session. */
  reqId?: string;
}

export async function sendWidgetOtp(identifier: string): Promise<WidgetSendResult> {
  await ensureReady();
  return new Promise((resolve, reject) => {
    window.sendOtp!(
      identifier,
      (data) => {
        devLog("sendOtp success", data);
        const reqId =
          data && typeof data === "object" && "message" in data && typeof (data as { message: unknown }).message === "string"
            ? (data as { message: string }).message
            : undefined;
        resolve({ reqId });
      },
      (error) => {
        devLog("sendOtp failure", error);
        reject(new Error(errorMessage(error, "Could not send the verification code. Please try again.")));
      },
    );
  });
}

export async function retryWidgetOtp(reqId?: string): Promise<void> {
  await ensureReady();
  return new Promise((resolve, reject) => {
    window.retryOtp!(
      null,
      (data) => {
        devLog("retryOtp success", data);
        resolve();
      },
      (error) => {
        devLog("retryOtp failure", error);
        reject(new Error(errorMessage(error, "Could not resend the code. Please try again.")));
      },
      reqId,
    );
  });
}

export async function verifyWidgetOtp(otp: string, reqId?: string): Promise<string> {
  await ensureReady();
  return new Promise((resolve, reject) => {
    window.verifyOtp!(
      otp,
      (data) => {
        devLog("verifyOtp success", data);
        const token =
          data && typeof data === "object" && "message" in data && typeof (data as { message: unknown }).message === "string"
            ? (data as { message: string }).message
            : undefined;
        if (!token) {
          reject(new Error("Verification succeeded but returned no token. Please try again."));
          return;
        }
        resolve(token);
      },
      (error) => {
        devLog("verifyOtp failure", error);
        reject(new Error(errorMessage(error, "Invalid or expired code.")));
      },
      reqId,
    );
  });
}
