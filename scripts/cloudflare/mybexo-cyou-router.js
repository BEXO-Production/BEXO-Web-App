/**
 * Cloudflare Worker — mybexo.cyou development router
 *
 * Host map:
 *   mybexo.cyou / www.mybexo.cyou  → MARKETING_URL  (static BEXO Website)
 *   dash.mybexo.cyou               → DASH_URL       (onboarding + dashboard SPA)
 *   {handle}.mybexo.cyou           → ORIGIN_URL     (Cloud Run portfolio engine)
 *
 * Also proxies /api/** on apex to ORIGIN_URL so legacy webhooks keep working
 * (prefer webhooks on https://dash.mybexo.cyou/api/... going forward).
 *
 * Cloudflare setup:
 *   1. Workers & Pages → Create Worker → paste this file (or wrangler deploy)
 *   2. Settings → Variables:
 *        PLATFORM_DOMAIN = mybexo.cyou
 *        ORIGIN_URL      = https://bexo-api-5oddipcbcq-el.a.run.app
 *        DASH_URL        = https://bexo-development.web.app
 *        MARKETING_URL   = https://mybexo.web.app
 *   3. Triggers → Add route: *mybexo.cyou/*
 *   4. DNS (orange-cloud / proxied):
 *        A/AAAA or CNAME  mybexo.cyou, www, dash, *  → Cloudflare
 *
 * Cloud Run only accepts *.run.app on TLS. Visitor Host is forwarded as
 * X-Forwarded-Host / X-Bexo-Host so Express subdomainRouter can render.
 */

const RESERVED_LABELS = new Set([
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
]);

function stripSlash(value) {
  return String(value || "").replace(/\/$/, "");
}

function proxyTo(base, request, url, extraHeaders = {}) {
  const target = new URL(url.pathname + url.search, stripSlash(base) + "/");
  const headers = new Headers(request.headers);
  for (const [k, v] of Object.entries(extraHeaders)) {
    if (v) headers.set(k, v);
  }
  headers.delete("host");
  return fetch(target.toString(), {
    method: request.method,
    headers,
    body: request.method !== "GET" && request.method !== "HEAD" ? request.body : undefined,
    redirect: "manual",
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const visitorHost = url.hostname.toLowerCase();
    const platformDomain = (env.PLATFORM_DOMAIN || "mybexo.cyou").toLowerCase();
    const originBase = stripSlash(env.ORIGIN_URL || "");
    const dashBase = stripSlash(env.DASH_URL || "");
    const marketingBase = stripSlash(env.MARKETING_URL || "");

    if (!originBase) {
      return new Response("ORIGIN_URL is not configured on the Worker.", { status: 500 });
    }

    const isApex =
      visitorHost === platformDomain || visitorHost === `www.${platformDomain}`;
    const isDash = visitorHost === `dash.${platformDomain}`;

    // --- Dashboard / app SPA (onboarding + dashboard + /api rewrites) ---
    if (isDash) {
      if (!dashBase) {
        return new Response("DASH_URL is not configured on the Worker.", { status: 500 });
      }
      return proxyTo(dashBase, request, url, {
        "X-Forwarded-Host": visitorHost,
        "X-Bexo-Host": visitorHost,
        "X-Forwarded-Proto": url.protocol.replace(":", ""),
      });
    }

    // --- Apex marketing site ---
    if (isApex) {
      // Keep Razorpay / legacy webhooks working if still pointed at apex /api
      if (url.pathname.startsWith("/api/")) {
        return proxyTo(originBase, request, url, {
          "X-Forwarded-Host": visitorHost,
          "X-Bexo-Host": visitorHost,
          "X-Forwarded-Proto": url.protocol.replace(":", ""),
        });
      }
      if (!marketingBase) {
        return new Response("MARKETING_URL is not configured on the Worker.", { status: 500 });
      }
      return proxyTo(marketingBase, request, url);
    }

    // --- Portfolio subdomains {handle}.mybexo.cyou ---
    if (!visitorHost.endsWith(`.${platformDomain}`)) {
      return new Response("Unknown host", { status: 404 });
    }

    const label = visitorHost.slice(0, -(platformDomain.length + 1));
    if (!label || label.includes(".") || RESERVED_LABELS.has(label)) {
      // Reserved / invalid → send humans to marketing or dash
      if (label === "dash" && dashBase) {
        return Response.redirect(`https://dash.${platformDomain}${url.pathname}${url.search}`, 302);
      }
      if (marketingBase) {
        return Response.redirect(`https://${platformDomain}/`, 302);
      }
      return new Response("Reserved subdomain", { status: 404 });
    }

    return proxyTo(originBase, request, url, {
      "X-Forwarded-Host": visitorHost,
      "X-Bexo-Host": visitorHost,
      "X-Forwarded-Proto": url.protocol.replace(":", ""),
    });
  },
};
