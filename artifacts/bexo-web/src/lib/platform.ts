/** Portfolio platform domain (subdomains: {handle}.atbexo.com). */
export const PLATFORM_DOMAIN =
  import.meta.env.VITE_PLATFORM_DOMAIN?.toLowerCase().trim() || "atbexo.com";

export function portfolioHostname(handle: string): string {
  const safe = String(handle || "")
    .toLowerCase()
    .trim();
  return `${safe}.${PLATFORM_DOMAIN}`;
}

export function portfolioPublicUrl(handle: string): string {
  return `https://${portfolioHostname(handle)}`;
}

export function portfolioLabel(handle: string): string {
  return portfolioHostname(handle);
}
