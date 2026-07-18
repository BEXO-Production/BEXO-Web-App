import { Request, Response, NextFunction } from "express";
import { db, profiles, users, profileSections } from "@workspace/db";
import { eq, or } from "drizzle-orm";
import { logger } from "../lib/logger";
import { resolveSubscriptionState } from "../lib/subscriptions";
import { buildPublicProfile } from "../lib/publicProfile";
import { Readable } from "stream";
import { readFile } from "node:fs/promises";
import {
  getTemplateBundleRoot,
  injectPortfolioBootstrap,
  resolveTemplateFile,
} from "../lib/templateRuntime";

// Map template IDs to their deployed URLs (or localhost for dev)
const TEMPLATE_URLS: Record<string, string> = {
  minimal: "https://resilient-hummingbird-87fc89.netlify.app",
  "cura-futuri": "http://localhost:5174", // TODO: Update with production URL
  "sierra-montana": "http://localhost:5500", // TODO: Update with production URL
  "nico-palmer": "http://localhost:5175", // TODO: Update with production URL
};

export async function subdomainRouter(req: Request, res: Response, next: NextFunction): Promise<void> {
  const host = req.hostname; // e.g., 'kavin.mybexo.com' or 'kavin.localhost'

  // API calls from a rendered template must reach the API routes, not be
  // interpreted as template assets.
  if (req.path.startsWith("/api/")) {
    return next();
  }
  
  // Skip if accessing the main domains directly
  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host.startsWith("www.") ||
    host.startsWith("api.") ||
    host === "mybexo.com"
  ) {
    return next();
  }

  // Extract the subdomain (e.g., 'kavin')
  const subdomain = host.split(".")[0];
  if (!subdomain) {
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

  try {
    // 1. Look up profile by handle or subdomain
    const profileMatch = await db.select()
      .from(profiles)
      .where(or(eq(profiles.handle, subdomain), eq(profiles.subdomain, subdomain)))
      .limit(1);

    if (profileMatch.length === 0) {
      // If no profile found, maybe redirect to a "Not Found" page or continue
      res.status(404).send("Portfolio not found.");
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
    
    const subscriptionState = await resolveSubscriptionState(user.id);

    // 3. Fetch profile sections
    const sections = await db.select().from(profileSections).where(eq(profileSections.profileId, profile.id));
    const getEntries = (type: string) => sections.find((s) => s.type === type)?.entries || [];
    const contactEntries = sections.find((s) => s.type === "contact")?.entries as Record<string, string> | undefined;

    // 4. Construct the canonical public profile (phone redacted)
    const templateIdForUser =
      profile.templateId && profile.templateId !== "minimal"
        ? profile.templateId
        : (user.templateId ?? "minimal");

    const profileData = buildPublicProfile({
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
      contactData: (contactEntries as Record<string, unknown>) || { email: user.email || "", linkedin: "", github: "", portfolio: "" },
    });

    // 5. Shared Hire Me page is template-neutral and served by the web app
    const requestPath = req.path || "/";
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

    // 7. Proxy the request
    // If it's a request for an asset or static file, just stream it directly
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

      if (templateFile.endsWith("index.html")) {
        const html = await readFile(templateFile, "utf8");
        res
          .status(200)
          .set("Cache-Control", "private, no-cache, no-store, must-revalidate")
          .type("html")
          .send(injectPortfolioBootstrap(html, profileData, basePath));
        return;
      }

      if (path.startsWith("/assets/")) {
        res.set("Cache-Control", "public, max-age=31536000, immutable");
      }
      res.sendFile(templateFile);
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
