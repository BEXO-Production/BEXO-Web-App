/**
 * Host map (production):
 *   mybexo.com           — marketing site (static)
 *   dash.mybexo.com      — login / onboarding / dashboard (this SPA)
 *   {handle}.atbexo.com  — live portfolios
 *
 * Development: mybexo.cyou may still serve app + portfolios combined.
 */

const ENV_PLATFORM =
  (typeof import.meta !== "undefined" &&
    import.meta.env?.VITE_PLATFORM_DOMAIN?.toLowerCase().trim()) ||
  "";

const ENV_MARKETING =
  (typeof import.meta !== "undefined" &&
    import.meta.env?.VITE_MARKETING_ORIGIN?.toLowerCase().trim()) ||
  "";

const ENV_DASH =
  (typeof import.meta !== "undefined" &&
    import.meta.env?.VITE_DASH_ORIGIN?.toLowerCase().trim()) ||
  "";

function cleanHost(value: string): string {
  return value.replace(/:\d+$/, "").toLowerCase().trim();
}

function currentHost(hostname?: string): string {
  return cleanHost(
    hostname ||
      (typeof window !== "undefined" ? window.location.hostname : "") ||
      "",
  );
}

/** True when this SPA is running on the dashboard host (or local Vite). */
export function isDashHost(hostname?: string): boolean {
  const host = currentHost(hostname);
  if (!host) return false;
  if (host === "dash.mybexo.com" || host === "dash.mybexo.cyou") return true;
  if (host === "localhost" || host === "127.0.0.1") return true;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true; // LAN Vite
  return host.startsWith("dash.");
}

/** Combined marketing+app host (dev) — still serves React LandingPage on `/`. */
export function isCombinedMarketingHost(hostname?: string): boolean {
  const host = currentHost(hostname);
  return host === "mybexo.cyou" || host === "www.mybexo.cyou";
}

/** Resolve portfolio host domain for the current browser (or build) environment. */
export function resolvePlatformDomain(hostname?: string): string {
  const host = currentHost(hostname);

  if (!host) return ENV_PLATFORM || "atbexo.com";

  if (host === "mybexo.cyou" || host.endsWith(".mybexo.cyou")) {
    return "mybexo.cyou";
  }
  if (host === "atbexo.com" || host.endsWith(".atbexo.com")) {
    return "atbexo.com";
  }
  // Production marketing + dash — user portfolios live on atbexo.com
  if (
    host === "mybexo.com" ||
    host === "www.mybexo.com" ||
    host === "dash.mybexo.com"
  ) {
    return "atbexo.com";
  }
  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host.endsWith(".localhost")
  ) {
    return ENV_PLATFORM || "localhost";
  }

  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.endsWith(".local")) {
    return ENV_PLATFORM || "mybexo.cyou";
  }

  return ENV_PLATFORM || "atbexo.com";
}

/** Public marketing site origin (mybexo.com in production). */
export function resolveMarketingOrigin(hostname?: string): string {
  if (ENV_MARKETING) return ENV_MARKETING.replace(/\/$/, "");

  const host = currentHost(hostname);
  if (host === "mybexo.cyou" || host.endsWith(".mybexo.cyou")) {
    return "https://mybexo.cyou";
  }
  if (
    host === "dash.mybexo.com" ||
    host === "mybexo.com" ||
    host === "www.mybexo.com" ||
    host === "atbexo.com" ||
    host.endsWith(".atbexo.com")
  ) {
    return "https://mybexo.com";
  }
  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    /^\d{1,3}(\.\d{1,3}){3}$/.test(host)
  ) {
    return ENV_MARKETING || "http://localhost:4173";
  }
  return "https://mybexo.com";
}

/** Dashboard / app origin (dash.mybexo.com in production). */
export function resolveDashOrigin(hostname?: string): string {
  if (ENV_DASH) return ENV_DASH.replace(/\/$/, "");

  const host = currentHost(hostname);
  if (typeof window !== "undefined" && isDashHost(host) && !hostname) {
    return window.location.origin.replace(/\/$/, "");
  }
  if (host === "mybexo.cyou" || host.endsWith(".mybexo.cyou")) {
    return "https://mybexo.cyou";
  }
  if (
    host === "dash.mybexo.com" ||
    host === "mybexo.com" ||
    host === "www.mybexo.com" ||
    host === "atbexo.com" ||
    host.endsWith(".atbexo.com")
  ) {
    return "https://dash.mybexo.com";
  }
  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    /^\d{1,3}(\.\d{1,3}){3}$/.test(host)
  ) {
    if (typeof window !== "undefined") {
      return window.location.origin.replace(/\/$/, "");
    }
    return "http://localhost:5173";
  }
  return "https://dash.mybexo.com";
}

/**
 * Origin of the running SPA (dash on production). Prefer this for in-app absolute URLs.
 * For “Powered by BEXO” / public marketing links, use resolveMarketingOrigin().
 */
export function resolveAppOrigin(hostname?: string): string {
  if (typeof window !== "undefined" && !hostname) {
    return window.location.origin.replace(/\/$/, "");
  }
  return resolveDashOrigin(hostname);
}

export const PLATFORM_DOMAIN = resolvePlatformDomain();

export function portfolioHostname(handle: string, hostname?: string): string {
  const safe = String(handle || "")
    .toLowerCase()
    .trim();
  return `${safe}.${resolvePlatformDomain(hostname)}`;
}

export function portfolioPublicUrl(handle: string, hostname?: string): string {
  return `https://${portfolioHostname(handle, hostname)}`;
}

export function portfolioLabel(handle: string, hostname?: string): string {
  return portfolioHostname(handle, hostname);
}
