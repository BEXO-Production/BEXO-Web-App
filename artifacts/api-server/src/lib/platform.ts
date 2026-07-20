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

export function getRequestHost(hostname: string, forwardedHost?: string | null): string {
  const raw = (forwardedHost || hostname || "").split(",")[0]?.trim() || hostname;
  return raw.replace(/:\d+$/, "").toLowerCase();
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
