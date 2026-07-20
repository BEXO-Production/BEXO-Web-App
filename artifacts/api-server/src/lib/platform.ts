/**
 * Platform hostname for portfolios and marketing links.
 * Development default: mybexo.cyou (production may override via env).
 */
export const PLATFORM_DOMAIN =
  process.env.PLATFORM_DOMAIN?.toLowerCase().trim() ||
  process.env.BEXO_PLATFORM_DOMAIN?.toLowerCase().trim() ||
  "mybexo.cyou";

export const PLATFORM_APEX_HOSTS = new Set([
  PLATFORM_DOMAIN,
  `www.${PLATFORM_DOMAIN}`,
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
    `https://${PLATFORM_DOMAIN}`
  ).replace(/\/$/, "");
}
