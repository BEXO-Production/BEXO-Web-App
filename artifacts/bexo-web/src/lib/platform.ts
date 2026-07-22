/**
 * Portfolio platform domain.
 *
 * Development:  {handle}.mybexo.cyou  (site + portfolios on mybexo.cyou)
 * Production:   {handle}.atbexo.com   (main site mybexo.com; user subs on atbexo.com)
 *
 * Prefer runtime host detection so a mis-baked VITE_PLATFORM_DOMAIN cannot
 * show the wrong public URL on the live dashboard.
 */

const ENV_PLATFORM =
  (typeof import.meta !== "undefined" &&
    import.meta.env?.VITE_PLATFORM_DOMAIN?.toLowerCase().trim()) ||
  "";

function cleanHost(value: string): string {
  return value.replace(/:\d+$/, "").toLowerCase().trim();
}

/** Resolve portfolio host domain for the current browser (or build) environment. */
export function resolvePlatformDomain(hostname?: string): string {
  const host = cleanHost(
    hostname ||
      (typeof window !== "undefined" ? window.location.hostname : "") ||
      "",
  );

  if (!host) return ENV_PLATFORM || "atbexo.com";

  if (host === "mybexo.cyou" || host.endsWith(".mybexo.cyou")) {
    return "mybexo.cyou";
  }
  if (host === "atbexo.com" || host.endsWith(".atbexo.com")) {
    return "atbexo.com";
  }
  // Production marketing/app apex — user portfolios live on atbexo.com
  if (host === "mybexo.com" || host === "www.mybexo.com") {
    return "atbexo.com";
  }
  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host.endsWith(".localhost")
  ) {
    return ENV_PLATFORM || "localhost";
  }

  return ENV_PLATFORM || "atbexo.com";
}

/** Apex / marketing origin for the current environment (not always the portfolio domain). */
export function resolveAppOrigin(hostname?: string): string {
  if (typeof window !== "undefined" && !hostname) {
    return window.location.origin.replace(/\/$/, "");
  }
  const platform = resolvePlatformDomain(hostname);
  if (platform === "mybexo.cyou") return "https://mybexo.cyou";
  if (platform === "atbexo.com") {
    // Prefer mybexo.com for production marketing when known; fall back to atbexo.
    const envApi = import.meta.env?.VITE_API_URL?.replace(/\/$/, "");
    if (envApi && !/localhost|127\.0\.0\.1/i.test(envApi)) return envApi;
    return "https://atbexo.com";
  }
  if (typeof window !== "undefined") {
    return window.location.origin.replace(/\/$/, "");
  }
  return `https://${platform}`;
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
