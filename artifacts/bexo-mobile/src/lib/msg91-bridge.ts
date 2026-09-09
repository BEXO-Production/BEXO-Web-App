/**
 * Mobile counterpart to bexo-web's src/lib/msg91Widget.ts. MSG91's OTP
 * Widget is a browser-JS product (loads a `<script>`, calls window-level
 * methods) — there is no way to embed it in React Native directly. MSG91's
 * own official React Native package solves this the same way: it wraps a
 * WebView around the identical script and bridges calls across
 * (`@msg91comm/sendotp-react-native` depends on react-native-webview). This
 * reimplements that bridge — same script, same widget, same server-side
 * verification — without the native biometric module that package also
 * ships, which BEXO doesn't use and which would force a custom dev-client
 * build (no Expo Go).
 *
 * `<Msg91OtpBridge />` (components/Msg91OtpBridge.tsx) is the actual WebView,
 * mounted once near the app root (app/_layout.tsx). It registers itself here
 * on mount; these exported functions are what screens actually call — they
 * wait for that registration rather than assuming it already happened, since
 * the WebView's script takes a moment to load over the network.
 */

export interface Msg91BridgeHandle {
  sendOtp(identifier: string): Promise<unknown>;
  retryOtp(reqId?: string): Promise<unknown>;
  verifyOtp(otp: string, reqId?: string): Promise<unknown>;
}

let bridge: Msg91BridgeHandle | null = null;
let readyWaiters: Array<() => void> = [];

export function registerMsg91Bridge(handle: Msg91BridgeHandle | null): void {
  bridge = handle;
  if (handle) {
    readyWaiters.forEach((resolve) => resolve());
    readyWaiters = [];
  }
}

function waitForBridge(): Promise<Msg91BridgeHandle> {
  if (bridge) return Promise.resolve(bridge);
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      readyWaiters = readyWaiters.filter((w) => w !== onReady);
      reject(new Error("Verification isn't ready yet. Please try again in a moment."));
    }, 15000);
    const onReady = () => {
      clearTimeout(timeout);
      if (bridge) resolve(bridge);
    };
    readyWaiters.push(onReady);
  });
}

/** MSG91's success/failure payloads consistently use `{ message, type }` — see
 * the server-side confirmation of this exact shape in msg91Widget.ts (web). */
function extractMessage(data: unknown): string | undefined {
  if (data && typeof data === "object" && "message" in data) {
    const m = (data as { message: unknown }).message;
    return typeof m === "string" ? m : undefined;
  }
  return undefined;
}

export interface WidgetSendResult {
  reqId?: string;
}

export async function sendWidgetOtp(identifier: string): Promise<WidgetSendResult> {
  const handle = await waitForBridge();
  const data = await handle.sendOtp(identifier);
  return { reqId: extractMessage(data) };
}

export async function retryWidgetOtp(reqId?: string): Promise<void> {
  const handle = await waitForBridge();
  await handle.retryOtp(reqId);
}

export async function verifyWidgetOtp(otp: string, reqId?: string): Promise<string> {
  const handle = await waitForBridge();
  const data = await handle.verifyOtp(otp, reqId);
  const token = extractMessage(data);
  if (!token) {
    throw new Error("Verification succeeded but returned no token. Please try again.");
  }
  return token;
}
