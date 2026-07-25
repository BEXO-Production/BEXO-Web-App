/**
 * Cloudflare Worker — wildcard portfolio subdomains (*.atbexo.com) → Cloud Run API
 *
 * atbexo.com is reserved exclusively for user portfolios ({handle}.atbexo.com).
 * Cloud Run only accepts its *.run.app Host on the TLS connection. This worker
 * proxies to ORIGIN_URL but forwards the visitor hostname via X-Forwarded-Host
 * so Express subdomainRouter can render {handle}.atbexo.com portfolios.
 *
 * The bare apex (atbexo.com / www.atbexo.com) is NOT a portfolio and NOT the
 * marketing site — it 301-redirects to the marketing domain (mybexo.com) so
 * marketing content is only ever served from mybexo.com.
 *
 * Deploy: Workers & Pages → Create/Update Worker → paste this file.
 * Route: *atbexo.com/*
 *
 * Environment variables (Worker settings):
 *   ORIGIN_URL = https://bexo-api-557785925639.asia-south1.run.app
 *   APEX_URL   = https://mybexo.com   (apex/www → 301 redirect to marketing)
 *   PLATFORM_DOMAIN = atbexo.com
 *
 * Production host map (2026-07 cutover):
 *   mybexo.com / www     → Firebase bexo-marketing (marketing site)
 *   dash.mybexo.com      → Firebase bexo-from-ace-digital (+ /api → Cloud Run)
 *   admin.mybexo.com     → Firebase bexo-admin-prod
 *   atbexo.com / www     → 301 redirect to mybexo.com
 *   {handle}.atbexo.com  → this Worker → Cloud Run
 *   assets.atbexo.com    → R2 bucket bexo-production (Worker disabled on route)
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const visitorHost = url.hostname.toLowerCase();
    const platformDomain = (env.PLATFORM_DOMAIN || "atbexo.com").toLowerCase();
    const originBase = (env.ORIGIN_URL || "").replace(/\/$/, "");
    const apexBase = (env.APEX_URL || "").replace(/\/$/, "");

    if (!originBase) {
      return new Response("ORIGIN_URL is not configured on the Worker.", { status: 500 });
    }

    // Bare apex / www are not portfolios. atbexo.com is portfolio-only, so send
    // apex traffic to the marketing domain with a permanent redirect (marketing
    // stays on mybexo.com; it is never served under atbexo.com).
    if (
      visitorHost === platformDomain ||
      visitorHost === `www.${platformDomain}`
    ) {
      const marketingBase = apexBase || "https://mybexo.com";
      return Response.redirect(marketingBase + url.pathname + url.search, 301);
    }

    const originUrl = new URL(url.pathname + url.search, originBase);
    const headers = new Headers(request.headers);
    headers.set("X-Forwarded-Host", visitorHost);
    headers.set("X-Bexo-Host", visitorHost);
    headers.set("X-Forwarded-Proto", url.protocol.replace(":", ""));
    headers.delete("host");

    return fetch(originUrl.toString(), {
      method: request.method,
      headers,
      body: request.method !== "GET" && request.method !== "HEAD" ? request.body : undefined,
      redirect: "manual",
    });
  },
};
