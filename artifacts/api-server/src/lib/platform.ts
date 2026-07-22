/**
 * Platform hostname for portfolios.
 * Development: {handle}.mybexo.cyou
 * Production portfolios: {handle}.atbexo.com
 * Development app: https://dash.mybexo.cyou
 * Production app: https://dash.mybexo.com
 * Development marketing: https://mybexo.cyou
 * Production marketing: https://mybexo.com
 */
export const PLATFORM_DOMAIN =
  process.env.PLATFORM_DOMAIN?.toLowerCase().trim() ||
  process.env.BEXO_PLATFORM_DOMAIN?.toLowerCase().trim() ||
  "mybexo.cyou";

/** Labels that must never be treated as portfolio handles. */
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

export const PLATFORM_APEX_HOSTS = new Set([
  PLATFORM_DOMAIN,
  `www.${PLATFORM_DOMAIN}`,
  `dash.${PLATFORM_DOMAIN}`,
]);

function cleanHost(value: string): string {
  return value.replace(/:\d+$/, "").toLowerCase().trim();
}

/**
 * Prefer visitor host from Worker/LB headers. Cloud Run often prepends its own
 * *.run.app host to X-Forwarded-Host — pick the platform domain when present.
 */
export function getRequestHost(
  hostname: string,
  forwardedHost?: string | null,
  bexoHost?: string | null,
): string {
  const candidates = [bexoHost, forwardedHost, hostname]
    .filter(Boolean)
    .flatMap((v) => String(v).split(","))
    .map(cleanHost)
    .filter(Boolean);

  const platformMatch = candidates.find(
    (h) => h === PLATFORM_DOMAIN || h.endsWith(`.${PLATFORM_DOMAIN}`),
  );
  if (platformMatch) return platformMatch;

  const nonRunApp = candidates.find((h) => !h.endsWith(".run.app"));
  return nonRunApp || cleanHost(hostname);
}

export function isPlatformApexHost(host: string): boolean {
  const h = host.toLowerCase();
  return PLATFORM_APEX_HOSTS.has(h);
}

export function isReservedSubdomain(label: string): boolean {
  return RESERVED_SUBDOMAINS.has(String(label || "").toLowerCase().trim());
}

export function portfolioHostname(handle: string): string {
  const safe = String(handle || "")
    .toLowerCase()
    .trim();
  return `${safe}.${PLATFORM_DOMAIN}`;
}

export function portfolioPublicUrl(handle: string): string {
  return `https://${portfolioHostname(handle)}`;
}

export function appOrigin(): string {
  return (
    process.env.FRONTEND_URL ||
    process.env.WEB_URL ||
    (PLATFORM_DOMAIN === "mybexo.cyou"
      ? "https://dash.mybexo.cyou"
      : "https://dash.mybexo.com")
  ).replace(/\/$/, "");
}

/** Public marketing site. */
export function marketingOrigin(): string {
  return (
    process.env.MARKETING_URL ||
    process.env.VITE_MARKETING_ORIGIN ||
    (PLATFORM_DOMAIN === "mybexo.cyou" ? "https://mybexo.cyou" : "https://mybexo.com")
  ).replace(/\/$/, "");
}
