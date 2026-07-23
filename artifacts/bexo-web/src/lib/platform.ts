/**
 * Host map (development):
 *   mybexo.cyou              — marketing site (static)
 *   dash.mybexo.cyou         — login / onboarding / dashboard (this SPA)
 *   {handle}.mybexo.cyou     — live portfolios
 *
 * Host map (production):
 *   mybexo.com               — marketing site (static)
 *   dash.mybexo.com          — login / onboarding / dashboard (this SPA)
 *   {handle}.atbexo.com      — live portfolios
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

/** Labels that must never be treated as portfolio handles in the SPA. */
export const RESERVED_SUBDOMAINS = new Set([
  "www",
  "dash",
  "api",
  "admin",
  "app",
  "mail",
  "ftp",
  "cdn",
  "static",
  "assets",
  "staging",
  "dev",
  "docs",
  "status",
  "support",
  "bexo",
]);

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

/**
 * Legacy combined marketing+app host.
 * After the Cloudflare split, apex is marketing-only.
 */
export function isCombinedMarketingHost(_hostname?: string): boolean {
  return false;
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

/**
 * Portfolio handle from hostname, or null on apex / dash / reserved hosts.
 * Free portfolios use path URLs on dash or apex — never treat `dash` as a handle.
 */
export function getPortfolioSubdomain(hostname?: string): string | null {
  const host = currentHost(hostname);
  if (!host || isDashHost(host)) return null;

  const parts = host.split(".");

  if (host.endsWith("localhost")) {
    if (parts.length > 1 && parts[0] !== "localhost" && parts[0] !== "www") {
      const label = parts[0].toLowerCase();
      if (RESERVED_SUBDOMAINS.has(label)) return null;
      return label;
    }
    return null;
  }

  const platform = resolvePlatformDomain(host);
  if (host === platform || host === `www.${platform}`) return null;

  if (host.endsWith(`.${platform}`) && parts.length >= 3) {
    const label = parts[0].toLowerCase();
    if (!label || label === "www" || RESERVED_SUBDOMAINS.has(label)) return null;
    // Reject multi-label prefixes like a.b.mybexo.cyou
    if (host.slice(0, -(platform.length + 1)).includes(".")) return null;
    return label;
  }

  return null;
}

/** Public marketing site origin. */
export function resolveMarketingOrigin(hostname?: string): string {
  if (ENV_MARKETING) return ENV_MARKETING.replace(/\/$/, "");

  const host = currentHost(hostname);
  if (host === "mybexo.cyou" || host.endsWith(".mybexo.cyou") || host === "dash.mybexo.cyou") {
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

/** Dashboard / app origin. */
export function resolveDashOrigin(hostname?: string): string {
  if (ENV_DASH) return ENV_DASH.replace(/\/$/, "");

  const host = currentHost(hostname);
  if (typeof window !== "undefined" && isDashHost(host) && !hostname) {
    return window.location.origin.replace(/\/$/, "");
  }
  if (host === "mybexo.cyou" || host.endsWith(".mybexo.cyou") || host === "dash.mybexo.cyou") {
    return "https://dash.mybexo.cyou";
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
 * Origin of the running SPA. Prefer this for in-app absolute URLs.
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

/** Free-tier public URL on the platform apex path: https://mybexo.cyou/{handle} (prod: atbexo.com/{handle}). */
export function pathPortfolioUrl(handle: string, hostname?: string): string {
  const safe = String(handle || "")
    .toLowerCase()
    .trim();
  const domain = resolvePlatformDomain(hostname);
  const origin =
    domain === "localhost"
      ? typeof window !== "undefined"
        ? window.location.origin.replace(/\/$/, "")
        : "http://localhost:5173"
      : `https://${domain}`;
  if (!safe) return origin;
  return `${origin}/${encodeURIComponent(safe)}`;
}

export function portfolioLabel(handle: string, hostname?: string): string {
  return portfolioHostname(handle, hostname);
}
