import Constants from "expo-constants";
import { setAuthTokenGetter, setBaseUrl } from "@workspace/api-client-react";
import { getAccessToken } from "./storage";

/**
 * Where the app talks to `artifacts/api-server`.
 *
 * In development the API lives on the same machine as the Metro bundler, and
 * that machine's LAN IP changes every time you join a different network. A
 * hardcoded `EXPO_PUBLIC_API_URL` goes stale the moment it does, and the app
 * then fails every request with "Host unreachable" — which is exactly what a
 * stale `192.168.x.x` in `.env` produced.
 *
 * So in dev we take the host Expo itself is being served from (the phone
 * already reached it — it loaded the bundle) and keep only the port from the
 * configured URL. A non-LAN URL (staging, production, a tunnel) is always
 * respected as-is.
 */

const DEFAULT_API_PORT = "5001";

/** True for loopback and RFC-1918 addresses — i.e. "only reachable on my LAN". */
function isLocalHost(host: string): boolean {
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "10.0.2.2" || // Android emulator's alias for the host machine
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  );
}

/** The host:port Expo served this bundle from, e.g. "192.168.1.34:8081". */
function metroHost(): string | null {
  const hostUri =
    Constants.expoConfig?.hostUri ??
    // Older/other manifest shapes still carry it in one of these places.
    (Constants as unknown as { expoGoConfig?: { debuggerHost?: string } }).expoGoConfig?.debuggerHost ??
    null;
  if (!hostUri) return null;
  return hostUri.split("/")[0]?.split(":")[0] ?? null;
}

export function resolveApiBaseUrl(): string | null {
  const configured = process.env.EXPO_PUBLIC_API_URL?.replace(/\/+$/, "") || null;

  if (!__DEV__) return configured;

  const host = metroHost();
  if (!host) return configured;

  if (!configured) return `http://${host}:${DEFAULT_API_PORT}`;

  try {
    const url = new URL(configured);
    // A real remote API (staging, prod, ngrok) must be left alone.
    if (!isLocalHost(url.hostname)) return configured;
    url.hostname = host;
    return url.toString().replace(/\/+$/, "");
  } catch {
    return `http://${host}:${DEFAULT_API_PORT}`;
  }
}

let baseUrl: string | null = null;

/**
 * Wires the shared `@workspace/api-client-react` package (also used by
 * bexo-web) to the api-server and to the JWT this app keeps in SecureStore.
 * Call once at startup, before any request.
 */
export function configureApiClient(): void {
  baseUrl = resolveApiBaseUrl();
  if (!baseUrl) {
    console.warn(
      "No API URL could be resolved — set EXPO_PUBLIC_API_URL in artifacts/bexo-mobile/.env.",
    );
  }
  setBaseUrl(baseUrl);
  setAuthTokenGetter(() => getAccessToken());
}

export function apiUrl(path: string): string {
  const base = (baseUrl ?? resolveApiBaseUrl() ?? "").replace(/\/+$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}
