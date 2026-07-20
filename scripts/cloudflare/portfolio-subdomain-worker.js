/**
 * Cloudflare Worker — wildcard portfolio subdomains (*.atbexo.com) → Cloud Run API
 *
 * Cloud Run only accepts its *.run.app Host on the TLS connection. This worker
 * proxies to ORIGIN_URL but forwards the visitor hostname via X-Forwarded-Host
 * so Express subdomainRouter can render {handle}.atbexo.com portfolios.
 *
 * Deploy: Workers & Pages → Create Worker → paste this file.
 * Route: *atbexo.com/*
 *
 * Environment variables (Worker settings):
 *   ORIGIN_URL = https://bexo-api-557785925639.asia-south1.run.app
 *   APEX_URL   = https://bexo-from-ace-digital.web.app  (optional — apex/www app)
 *   PLATFORM_DOMAIN = atbexo.com
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

    if (
      visitorHost === platformDomain ||
      visitorHost === `www.${platformDomain}`
    ) {
      if (apexBase) {
        const apexUrl = new URL(url.pathname + url.search, apexBase);
        return fetch(apexUrl.toString(), {
          method: request.method,
          headers: request.headers,
          body: request.method !== "GET" && request.method !== "HEAD" ? request.body : undefined,
          redirect: "manual",
        });
      }
      return Response.redirect(`https://www.${platformDomain}/`, 302);
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
