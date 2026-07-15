import { Request, Response, NextFunction } from "express";
import { db, profiles, users, profileSections, subscriptions } from "@workspace/db";
import { eq, or } from "drizzle-orm";
import { logger } from "../lib/logger";
import { resolveSubscriptionState } from "../lib/subscriptions";

// Map template IDs to their deployed URLs (or localhost for dev)
const TEMPLATE_URLS: Record<string, string> = {
  minimal: "https://resilient-hummingbird-87fc89.netlify.app",
  "cura-futuri": "http://localhost:5174", // TODO: Update with production URL
  "sierra-montana": "http://localhost:5500", // TODO: Update with production URL
  "nico-palmer": "http://localhost:5175", // TODO: Update with production URL
};

export async function subdomainRouter(req: Request, res: Response, next: NextFunction): Promise<void> {
  const host = req.hostname; // e.g., 'kavin.mybexo.com' or 'kavin.localhost'
  
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

    // 4. Construct the BEXO_PROFILE object exactly as the frontend expects it
    const profileData = {
      profile: {
        handle: profile.handle,
        headline: profile.headline,
        careerGoal: profile.careerGoal,
        bio: profile.bio,
        completionPct: profile.completionPct,
      },
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        photoUrl: user.photoUrl,
        resumeUrl: user.resumeUrl,
        openToHire: user.openToHire ?? false,
        templateId: profile.templateId && profile.templateId !== 'minimal' ? profile.templateId : (user.templateId ?? 'minimal'),
        themeColor: user.themeColor ?? 'blue',
        themeBg: user.themeBg ?? 'grid',
      },
      isPremium: profile.isPremium || subscriptionState.isPremium,
      aboutEntries: getEntries("about"),
      educationEntries: getEntries("education"),
      experienceEntries: getEntries("experience"),
      projectEntries: getEntries("projects"),
      certificateEntries: getEntries("certificates"),
      achievementEntries: getEntries("achievements"),
      researchEntries: getEntries("research"),
      contactData: contactEntries || { email: user.email || "", phone: user.phone || "", linkedin: "", github: "", portfolio: "" },
    };

    // 5. Determine which template to render
    const templateId = profileData.user.templateId;
    const targetUrl = TEMPLATE_URLS[templateId] || TEMPLATE_URLS["minimal"];

    // 6. Fetch the raw HTML from the template server
    logger.info(`Proxying subdomain ${subdomain} to template ${templateId} (${targetUrl})`);
    
    const templateRes = await fetch(targetUrl);
    if (!templateRes.ok) {
      res.status(502).send("Error fetching template from upstream.");
      return;
    }

    let html = await templateRes.text();

    // 7. Inject the profile data into the <head>
    const injection = `
      <script>
        window.__BEXO_PROFILE__ = ${JSON.stringify(profileData)};
      </script>
    `;
    
    if (html.includes("</head>")) {
      html = html.replace("</head>", `${injection}</head>`);
    } else {
      // Fallback
      html = injection + html;
    }

    // 8. Serve the injected HTML!
    res.setHeader("Content-Type", "text/html");
    res.send(html);

  } catch (err) {
    logger.error({ err, subdomain }, "Error processing subdomain routing");
    res.status(500).send("Internal server error");
  }
}
