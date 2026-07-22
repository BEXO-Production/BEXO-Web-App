import { Request, Response, NextFunction } from "express";
import { db, profiles, users, profileSections } from "@workspace/db";
import { eq, or } from "drizzle-orm";
import { logger } from "../lib/logger";
import { resolveSubscriptionState } from "../lib/subscriptions";
import { buildPausedPortfolioHtml, resolveSiteAccess } from "../lib/siteAccess";
import { buildPublicProfile } from "../lib/publicProfile";
import { Readable } from "stream";
import { readFile } from "node:fs/promises";
import {
  getTemplateBundleRoot,
  injectPortfolioBootstrap,
  resolveTemplateFile,
} from "../lib/templateRuntime";
import {
  getMarketingDemoProfile,
  isMarketingDemoHandle,
  MARKETING_DEMO_ASSETS_DIR,
} from "../lib/marketingDemoProfile";
import express from "express";
import {
  getRequestHost,
  isPlatformApexHost,
  isReservedSubdomain,
  PLATFORM_DOMAIN,
  portfolioHostname,
} from "../lib/platform";
import { buildUnclaimedHandleHtml } from "../lib/claimUnclaimedHandleHtml";
import {
  getPortfolioRenderCache,
  setPortfolioRenderCache,
} from "../lib/portfolioRenderCache";
import { agentDebugLog } from "../lib/agentDebugLog";

type CachedPortfolio = {
  profileData: ReturnType<typeof buildPublicProfile>;
  siteAccess: Awaited<ReturnType<typeof resolveSiteAccess>>;
  userName: string | null;
};

// Map template IDs to their deployed URLs (or localhost for dev)
const TEMPLATE_URLS: Record<string, string> = {
  minimal: "https://resilient-hummingbird-87fc89.netlify.app",
  "cura-futuri": "http://localhost:5174", // TODO: Update with production URL
  "sierra-montana": "http://localhost:5500", // TODO: Update with production URL
  "nico-palmer": "http://localhost:5175", // fallback when bundle missing; production uses template-bundles
};

/** Serve AI marketing demo assets (portrait / project stills). */
export const marketingDemoStatic = express.static(MARKETING_DEMO_ASSETS_DIR, {
  maxAge: process.env.NODE_ENV === "production" ? "7d" : 0,
  fallthrough: false,
});

async function renderBundledTemplate(
  req: Request,
  res: Response,
  profileData: ReturnType<typeof getMarketingDemoProfile>,
  templateId: string,
  basePath: string,
  pathName: string,
  subdomain: string,
): Promise<boolean> {
  const localBundleRoot = getTemplateBundleRoot(templateId);
  if (!localBundleRoot) return false;

  const templateFile = resolveTemplateFile(localBundleRoot, pathName);
  if (!templateFile) {
    res.status(404).send("Template asset not found.");
    return true;
  }

  logger.info(`Serving bundled template ${templateId} for ${subdomain}`);

  if (templateFile.endsWith(".html")) {
    const html = await readFile(templateFile, "utf8");
    res
      .status(200)
      .set("Cache-Control", "private, no-cache, no-store, must-revalidate")
      .type("html")
      .send(injectPortfolioBootstrap(html, profileData, basePath));
    return true;
  }

  if (
    pathName.startsWith("/assets/") ||
    pathName.startsWith("/css/") ||
    pathName.startsWith("/js/") ||
    pathName.startsWith("/Fonts/") ||
    pathName.startsWith("/fonts/")
  ) {
    res.set(
      "Cache-Control",
      process.env.NODE_ENV === "production"
        ? "public, max-age=31536000, immutable"
        : "no-cache",
    );
  }
  res.sendFile(templateFile);
  return true;
}

export async function subdomainRouter(req: Request, res: Response, next: NextFunction): Promise<void> {
  const host = getRequestHost(
    req.hostname,
    req.get("x-forwarded-host"),
    req.get("x-bexo-host"),
  );

  // API calls from a rendered template must reach the API routes, not be
  // interpreted as template assets.
  if (req.path.startsWith("/api/")) {
    return next();
  }

  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host.endsWith(".run.app") ||
    host.startsWith("api.") ||
    isPlatformApexHost(host)
  ) {
    return next();
  }

  const isPortfolioHost =
    host.endsWith(`.${PLATFORM_DOMAIN}`) ||
    (host.endsWith(".localhost") && host !== "localhost");
  if (!isPortfolioHost) {
    return next();
  }

  const subdomain = host.split(".")[0];
  if (!subdomain || isReservedSubdomain(subdomain)) {
    return next();
  }

  await renderPortfolioForHandle(req, res, subdomain);
}

export async function renderPortfolioForHandle(
  req: Request,
  res: Response,
  handle: string,
  options: {
    basePath?: string;
    requestPath?: string;
    templateOverride?: string;
  } = {},
): Promise<void> {
  const subdomain = handle.toLowerCase().trim();
  const basePath = options.basePath || "/";
  const requestPath = options.requestPath || req.path || "/";

  try {
    // ── Marketing showcase (landing previews) — never a real user profile ──
    if (isMarketingDemoHandle(subdomain)) {
      let previewOverride =
        options.templateOverride || (req.query.preview_template as string) || "";
      if (!previewOverride && req.cookies?.preview_template) {
        previewOverride = req.cookies.preview_template;
      }
      if (previewOverride) {
        res.cookie("preview_template", previewOverride, {
          maxAge: 1000 * 60 * 60,
          httpOnly: false,
        });
      }

      const profileData = getMarketingDemoProfile(previewOverride || undefined);
      const templateId = previewOverride || profileData.user.templateId;

      if (requestPath === "/hire-me" || requestPath.startsWith("/hire-me/")) {
        const webBase =
          process.env.FRONTEND_URL || process.env.WEB_URL || "http://localhost:5173";
        res.redirect(302, `${webBase.replace(/\/$/, "")}/hire-me/${encodeURIComponent(subdomain)}`);
        return;
      }

      const served = await renderBundledTemplate(
        req,
        res,
        profileData,
        templateId,
        basePath,
        requestPath,
        subdomain,
      );
      if (served) return;

      res.status(404).send("Marketing demo template not available.");
      return;
    }

    // 1. Look up + assemble profile (short TTL cache absorbs concurrent viewers)
    const cacheKey = subdomain;
    let cached = getPortfolioRenderCache<CachedPortfolio>(cacheKey);
    let profileData: ReturnType<typeof buildPublicProfile>;
    let siteAccess: Awaited<ReturnType<typeof resolveSiteAccess>>;
    let ownerName: string | null | undefined;

    if (cached) {
      // #region agent log
      agentDebugLog("L", "subdomainRouter:cache-hit", "portfolio render cache hit", { subdomain });
      // #endregion
      profileData = cached.profileData;
      siteAccess = cached.siteAccess;
      ownerName = cached.userName;
    } else {
      // #region agent log
      agentDebugLog("L", "subdomainRouter:cache-miss", "portfolio render cache miss", { subdomain });
      // #endregion
      const profileMatch = await db.select()
        .from(profiles)
        .where(or(eq(profiles.handle, subdomain), eq(profiles.subdomain, subdomain)))
        .limit(1);

      if (profileMatch.length === 0) {
        res
          .status(404)
          .type("html")
          .set("Cache-Control", "public, max-age=60")
          .send(buildUnclaimedHandleHtml(subdomain));
        return;
      }

      const profile = profileMatch[0];

      // 2. Fetch associated user and subscription
      const userMatch = await db.select().from(users).where(eq(users.id, profile.userId)).limit(1);
      if (userMatch.length === 0) {
        res.status(404).send("User not found.");
        return;
      }
      const user = userMatch[0];
      ownerName = user.name;
    
      const subscriptionState = await resolveSubscriptionState(user.id);
      siteAccess = await resolveSiteAccess(user.id);

      // 3. Fetch profile sections
      const sections = await db.select().from(profileSections).where(eq(profileSections.profileId, profile.id));
      const getEntries = (type: string) => sections.find((s) => s.type === type)?.entries || [];
      const contactEntries = sections.find((s) => s.type === "contact")?.entries as Record<string, string> | undefined;

      // 4. Construct the canonical public profile (phone redacted)
      const templateIdForUser =
        profile.templateId && profile.templateId !== "minimal"
          ? profile.templateId
          : (user.templateId ?? "minimal");

      profileData = buildPublicProfile({
        profile,
        user: {
          ...user,
          templateId: subscriptionState.isPremium || profile.isPremium ? templateIdForUser : "minimal",
          themeColor: user.themeColor ?? "blue",
          themeBg: user.themeBg ?? "grid",
          openToHire: user.openToHire ?? false,
        },
        isPremium: profile.isPremium || subscriptionState.isPremium,
        aboutEntries: getEntries("about"),
        educationEntries: getEntries("education"),
        experienceEntries: getEntries("experience"),
        projectEntries: getEntries("projects"),
        certificateEntries: getEntries("certificates"),
        achievementEntries: getEntries("achievements"),
        researchEntries: getEntries("research"),
        skillEntries: getEntries("skills"),
        contactData: (contactEntries as Record<string, unknown>) || { email: user.email || "", linkedin: "", github: "", portfolio: "" },
      });

      setPortfolioRenderCache(cacheKey, {
        profileData,
        siteAccess,
        userName: ownerName ?? null,
      } satisfies CachedPortfolio);
    }

    // Paused portfolios: never serve the live template to visitors.
    // Owners still manage content from the dashboard / billing.
    const isAssetPath =
      requestPath.startsWith("/assets/") ||
      requestPath.startsWith("/css/") ||
      requestPath.startsWith("/js/") ||
      requestPath.startsWith("/Fonts/") ||
      requestPath.startsWith("/fonts/");
    if (siteAccess.isPausedForVisitors && !isAssetPath) {
      res
        .status(503)
        .set("Cache-Control", "private, no-cache, no-store, must-revalidate")
        .type("html")
        .send(
          buildPausedPortfolioHtml({
            handle: subdomain,
            reason: siteAccess.pauseReason,
            ownerName: ownerName,
          }),
        );
      return;
    }

    // 5. Shared Hire Me page is template-neutral and served by the web app
    if (requestPath === "/hire-me" || requestPath.startsWith("/hire-me/")) {
      const webBase =
        process.env.FRONTEND_URL ||
        process.env.WEB_URL ||
        "http://localhost:5173";
      const hireMeUrl = `${webBase.replace(/\/$/, "")}/hire-me/${encodeURIComponent(subdomain)}`;
      res.redirect(302, hireMeUrl);
      return;
    }

    // 6. Determine which template to render
    // Allow overriding via query string, cookie, or Referer (for assets) for easy testing
    let previewOverride =
      options.templateOverride || (req.query.preview_template as string);
    
    if (previewOverride) {
      // Set a cookie so asset requests maintain the preview template
      res.cookie("preview_template", previewOverride, { maxAge: 1000 * 60 * 60, httpOnly: false });
    } else {
      // Fallback to cookie
      if (req.cookies && req.cookies.preview_template) {
        previewOverride = req.cookies.preview_template;
      }
      
      // Fallback to referer if cookie not present
      if (!previewOverride && req.headers.referer) {
        try {
          const refererUrl = new URL(req.headers.referer);
          previewOverride = refererUrl.searchParams.get("preview_template") || "";
        } catch (e) {
          // ignore invalid URL
        }
      }
    }
    
    const templateId = previewOverride || profileData.user.templateId;
    const localBundleRoot = getTemplateBundleRoot(templateId);
    const targetUrl = TEMPLATE_URLS[templateId] || TEMPLATE_URLS["minimal"];

    // 7. Proxy / serve the request
    const path = options.requestPath || req.path;
    const fullTargetUrl = `${targetUrl}${req.originalUrl}`;
    
    logger.info(
      localBundleRoot
        ? `Serving bundled template ${templateId} for ${subdomain}`
        : `Proxying subdomain ${subdomain} to template ${templateId} (${fullTargetUrl})`,
    );

    // Premium templates ship inside the API image. No standalone template
    // host is required; the gateway serves assets and injects this handle's
    // canonical profile into the SPA shell.
    if (localBundleRoot) {
      const templateFile = resolveTemplateFile(localBundleRoot, path);
      if (!templateFile) {
        res.status(404).send("Template asset not found.");
        return;
      }

      // Multi-page templates (Sierra) and SPAs (Cura) both need profile
      // injection on every HTML document, not only index.html.
      if (templateFile.endsWith(".html")) {
        const html = await readFile(templateFile, "utf8");
        const isPreview = Boolean(previewOverride);
        res
          .status(200)
          .set(
            "Cache-Control",
            isPreview
              ? "private, no-cache, no-store, must-revalidate"
              : "public, max-age=30, stale-while-revalidate=120",
          )
          .type("html")
          .send(injectPortfolioBootstrap(html, profileData, basePath));
        return;
      }

      if (
        path.startsWith("/assets/") ||
        path.startsWith("/css/") ||
        path.startsWith("/js/") ||
        path.startsWith("/Fonts/") ||
        path.startsWith("/fonts/")
      ) {
        // Long-lived caching only in production; local development needs
        // fresh assets on every reload for template iteration.
        res.set(
          "Cache-Control",
          process.env.NODE_ENV === "production"
            ? "public, max-age=31536000, immutable"
            : "no-cache",
        );
      }
      res.sendFile(templateFile);
      return;
    }

    // No local bundle (e.g. free users forced onto "minimal"). Never proxy the
    // Netlify demo site for subdomain visits — send them to the free path URL.
    if (!previewOverride && templateId === "minimal") {
      const webBase =
        process.env.FRONTEND_URL ||
        process.env.WEB_URL ||
        "http://localhost:5173";
      const freeUrl = `${webBase.replace(/\/$/, "")}/${encodeURIComponent(subdomain)}`;
      const isPremiumUser = !!profileData?.isPremium;
      res
        .status(200)
        .type("html")
        .send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${isPremiumUser ? "Portfolio" : "Subdomain locked"} · BEXO</title>
<style>
  body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,sans-serif;background:#f8fafc;color:#0f172a}
  .card{max-width:28rem;padding:2rem;border-radius:1.25rem;background:#fff;border:1px solid #e2e8f0;box-shadow:0 10px 30px rgba(15,23,42,.06);text-align:center}
  a{display:inline-flex;margin-top:1.25rem;padding:.75rem 1.25rem;border-radius:.75rem;background:#0f172a;color:#fff;text-decoration:none;font-weight:700;font-size:.8rem}
  p{color:#64748b;line-height:1.5;font-size:.9rem}
</style></head><body><div class="card">
<h1 style="margin:0 0 .5rem;font-size:1.35rem">${isPremiumUser ? "Open your portfolio" : "Custom subdomain is Pro"}</h1>
<p>${isPremiumUser
  ? "Your free Minimal layout lives on the BEXO path URL."
  : `Custom subdomains like <strong>${portfolioHostname(subdomain)}</strong> need Pro. Your free portfolio is still live:`}</p>
<a href="${freeUrl}">${freeUrl.replace(/^https?:\/\//, "")}</a>
</div></body></html>`);
      return;
    }
    
    try {
      const proxyRes = await fetch(fullTargetUrl, {
        method: req.method,
        headers: {
          ...req.headers,
          host: new URL(targetUrl).host,
        } as any,
      });

      // Node fetch auto-decompresses upstream responses.
      proxyRes.headers.forEach((value, key) => {
        if (key.toLowerCase() === "content-encoding" || key.toLowerCase() === "content-length") {
          return;
        }
        res.setHeader(key, value);
      });
      res.status(proxyRes.status);

      // Deep links can also return an SPA shell. Inject based on response
      // content type rather than only for "/", preventing demo fallback data.
      const contentType = proxyRes.headers.get("content-type") || "";
      if (contentType.includes("text/html")) {
        const html = await proxyRes.text();
        res
          .type("html")
          .send(injectPortfolioBootstrap(html, profileData, basePath));
        return;
      }

      if (proxyRes.body) {
        // @ts-ignore Node's Readable.fromWeb expects the compatible web stream.
        Readable.fromWeb(proxyRes.body as any).pipe(res);
      } else {
        res.end();
      }
    } catch (err) {
      logger.error({ err, subdomain, templateId }, "Error proxying template");
      res.status(502).send("Error fetching template.");
    }

  } catch (err) {
    logger.error({ err, subdomain }, "Error processing subdomain routing");
    res.status(500).send("Internal server error");
  }
}
