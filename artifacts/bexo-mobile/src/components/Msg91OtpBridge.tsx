import { useEffect, useRef } from "react";
import { Platform, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { registerMsg91Bridge, type Msg91BridgeHandle } from "@/lib/msg91-bridge";

/**
 * react-native-webview@13.17.0's own index.d.ts declares
 * `class WebView<P = undefined> extends Component<WebViewProps & P>` — with
 * the generic left at its default, `WebViewProps & undefined` collapses to
 * `never`, so every prop on a bare `<WebView>` fails to typecheck. Supplying
 * `object` for `P` sidesteps the library's bug without touching its source.
 */
type WebViewRef = WebView<object>;

const WIDGET_ID = process.env.EXPO_PUBLIC_MSG91_WIDGET_ID ?? "";
const TOKEN_AUTH = process.env.EXPO_PUBLIC_MSG91_WIDGET_TOKEN_AUTH ?? "";

/**
 * Self-contained page loaded into the WebView below — same widget script bexo-web
 * uses (verify.msg91.com/otp-provider.js), same exposeMethods:true custom-UI mode,
 * so no MSG91 popup ever renders; only our own screens' UI does.
 *
 * Every call from the RN side is tagged with a numeric `id` (see `call()` in the
 * component) and answered with a `postMessage` carrying that same id, so
 * concurrent/out-of-order calls can't resolve the wrong promise.
 */
const HTML = `<!DOCTYPE html>
<html>
<body>
<script>
  function post(msg) {
    window.ReactNativeWebView.postMessage(JSON.stringify(msg));
  }

  // Surface anything that would otherwise die silently inside the WebView —
  // without this, a script error here just looks like "nothing happens" on
  // the RN side (the call() promise sits until its own 20s timeout).
  window.onerror = function (message) {
    post({ kind: 'ready-error', error: 'Widget script error: ' + message });
  };

  var configuration = {
    widgetId: ${JSON.stringify(WIDGET_ID)},
    tokenAuth: ${JSON.stringify(TOKEN_AUTH)},
    exposeMethods: true,
    captchaRenderId: '',
    // Ignored in favor of verifyOtp's own per-call callback (see msg91-bridge.ts) —
    // listening to both fires duplicate events, per MSG91's own docs.
    success: function (data) {},
    failure: function (error) {},
  };

  function afterScriptLoad() {
    try {
      initSendOTP(configuration);
    } catch (e) {
      post({ kind: 'ready-error', error: String(e && e.message || e) });
      return;
    }
    var tries = 0;
    var iv = setInterval(function () {
      tries++;
      if (typeof window.sendOtp === 'function' && typeof window.verifyOtp === 'function') {
        clearInterval(iv);
        post({ kind: 'ready' });
      } else if (tries > 50) {
        clearInterval(iv);
        post({ kind: 'ready-error', error: 'Widget script did not finish initializing.' });
      }
    }, 100);
  }

  window.__bxSendOtp = function (id, identifier) {
    window.sendOtp(
      identifier,
      function (data) { post({ kind: 'call', id: id, ok: true, data: data }); },
      function (error) { post({ kind: 'call', id: id, ok: false, error: error }); },
    );
  };
  window.__bxRetryOtp = function (id, reqId) {
    window.retryOtp(
      null,
      function (data) { post({ kind: 'call', id: id, ok: true, data: data }); },
      function (error) { post({ kind: 'call', id: id, ok: false, error: error }); },
      reqId,
    );
  };
  window.__bxVerifyOtp = function (id, otp, reqId) {
    window.verifyOtp(
      otp,
      function (data) { post({ kind: 'call', id: id, ok: true, data: data }); },
      function (error) { post({ kind: 'call', id: id, ok: false, error: error }); },
      reqId,
    );
  };
</script>
<script src="https://verify.msg91.com/otp-provider.js" onload="afterScriptLoad()" onerror="post({kind:'ready-error', error:'Could not load the verification script.'})"></script>
</body>
</html>`;

interface PendingCall {
  resolve: (data: unknown) => void;
  reject: (error: Error) => void;
}

function errorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === "object" && "message" in error) {
    const m = (error as { message: unknown }).message;
    if (typeof m === "string" && m) return m;
  }
  return fallback;
}

/**
 * Invisible (0x0) WebView hosting the MSG91 widget script. Mount exactly once,
 * near the app root — see app/_layout.tsx. Everything it does is reached
 * through src/lib/msg91-bridge.ts, never through this component directly.
 *
 * Native (iOS/Android) only — react-native-webview ships no web implementation
 * at all (its web fallback literally renders "does not support this
 * platform"). That's fine: the web build of this app isn't a real product
 * surface, and the actual website has its own separate widget integration
 * (bexo-web/src/lib/msg91Widget.ts) built directly on the DOM. On web this
 * component intentionally never registers a bridge, so any accidental call
 * fails fast with a clear "Verification isn't ready" instead of a native
 * dependency crashing an unsupported platform.
 */
export function Msg91OtpBridge() {
  if (Platform.OS === "web") return null;
  return <Msg91OtpBridgeNative />;
}

function Msg91OtpBridgeNative() {
  const webviewRef = useRef<WebViewRef>(null);
  const readyRef = useRef(false);
  const pending = useRef(new Map<number, PendingCall>());
  const nextId = useRef(0);

  useEffect(() => {
    function call(build: (id: number) => string): Promise<unknown> {
      return new Promise((resolve, reject) => {
        if (!readyRef.current) {
          reject(new Error("Verification isn't ready yet. Please try again in a moment."));
          return;
        }
        const id = nextId.current++;
        const timeout = setTimeout(() => {
          if (pending.current.delete(id)) {
            reject(new Error("Verification timed out. Please check your connection and try again."));
          }
        }, 20000);
        pending.current.set(id, {
          resolve: (data) => {
            clearTimeout(timeout);
            resolve(data);
          },
          reject: (err) => {
            clearTimeout(timeout);
            reject(err);
          },
        });
        webviewRef.current?.injectJavaScript(build(id) + "; true;");
      });
    }

    const handle: Msg91BridgeHandle = {
      sendOtp: (identifier) => call((id) => `window.__bxSendOtp(${id}, ${JSON.stringify(identifier)})`),
      retryOtp: (reqId) => call((id) => `window.__bxRetryOtp(${id}, ${reqId ? JSON.stringify(reqId) : "null"})`),
      verifyOtp: (otp, reqId) =>
        call((id) => `window.__bxVerifyOtp(${id}, ${JSON.stringify(otp)}, ${reqId ? JSON.stringify(reqId) : "null"})`),
    };
    registerMsg91Bridge(handle);
    return () => registerMsg91Bridge(null);
  }, []);

  const onMessage = (event: WebViewMessageEvent) => {
    let msg: { kind: string; id?: number; ok?: boolean; data?: unknown; error?: unknown };
    try {
      msg = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }

    if (msg.kind === "ready") {
      readyRef.current = true;
      return;
    }
    if (msg.kind === "ready-error") {
      readyRef.current = false;
      return;
    }
    if (msg.kind === "call" && typeof msg.id === "number") {
      const entry = pending.current.get(msg.id);
      if (!entry) return;
      pending.current.delete(msg.id);
      if (msg.ok) entry.resolve(msg.data);
      else entry.reject(new Error(errorMessage(msg.error, "Something went wrong. Please try again.")));
    }
  };

  return (
    <View style={{ width: 0, height: 0, overflow: "hidden" }} pointerEvents="none">
      <WebView<object>
        ref={webviewRef}
        // `baseUrl` matters here: without it, HTML-string sources get no
        // real origin (`about:blank` on iOS, a `file://` origin on Android).
        // MSG91's own script — same one bexo-web uses, confirmed working
        // there against a real `https://` origin — talks to
        // control.msg91.com and, per the "Web requests are not allowed for
        // this widget" error hit earlier setting this up, clearly does
        // origin-aware checks. Pointing baseUrl at MSG91's own domain gives
        // the page a legitimate https origin instead of none.
        source={{ html: HTML, baseUrl: "https://verify.msg91.com" }}
        onMessage={onMessage}
        javaScriptEnabled
        domStorageEnabled
        originWhitelist={["*"]}
        mixedContentMode="always"
        // The widget script needs a real network round trip; nothing here
        // should ever be visible, so errors surface only through rejected
        // promises in msg91-bridge.ts, not through this view.
        style={{ width: 1, height: 1 }}
      />
    </View>
  );
}
