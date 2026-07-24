import { Router } from "express";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { requireAuth, optionalAuth, AuthenticatedRequest } from "../middlewares/auth";
import {
  db,
  users,
  profiles,
  profileSections,
  payments,
  subscriptions,
  contactSubmissions,
  resumeParseAttempts,
  assets,
} from "@workspace/db";
import { eq, and, desc, gt, sql, inArray } from "drizzle-orm";
import { logger } from "../lib/logger";
import { MARKETING_DEMO_HANDLE, getMarketingDemoProfile, isMarketingDemoHandle } from "../lib/marketingDemoProfile";
import { invalidatePortfolioRenderCache } from "../lib/portfolioRenderCache";
import multer from "multer";
import { createRequire } from "module";
import { uploadToR2, deleteFromR2 } from "../lib/r2";
import { generateATSResume } from "../lib/resumeEngine";
import { executeResilientResumeParsing } from "../lib/aiResilienceEngine";
import { resolveSubscriptionState, syncStorageQuota, recomputeUserQuota } from "../lib/subscriptions";
import { resolveSiteAccess } from "../lib/siteAccess";
import {
  ONBOARDING_PARSE_LIMIT,
  consumeUpdate,
  getParsesUsage,
  getPlanLimits,
  getUpdatesUsage,
} from "../lib/entitlements";
import { buildPublicProfile } from "../lib/publicProfile";
import { normalizeSkills, MAX_SKILLS } from "../lib/publicProfile";
import { enqueueEmail } from "../lib/emailOutbox";
import {
  enqueueWelcomeEmail,
  markOnboardingActivity,
  markOnboardingComplete,
} from "../lib/lifecycleEmails";

const require = createRequire(import.meta.url);
const pdf = require("pdf-parse");

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 } // 15MB limit to support larger PDFs/images
});

/** True when `next` introduces any skill name not already on the profile. */
function skillsContainAdditions(existing: unknown, next: unknown): boolean {
  const before = new Set(
    normalizeSkills(existing).map((s) => s.name.toLowerCase()),
  );
  return normalizeSkills(next).some((s) => !before.has(s.name.toLowerCase()));
}

/** Count list entries in `next` whose id is not present in `existing`. */
function countNetNewEntries(existing: unknown, next: unknown): number {
  if (!Array.isArray(next)) return 0;
  const existingList = Array.isArray(existing) ? existing : [];
  const before = new Set(
    existingList
      .map((e: any) => String(e?.id ?? "").trim())
      .filter(Boolean),
  );
  // First-time normalize (legacy rows without ids): don't treat every row as "new".
  if (existingList.length > 0 && before.size === 0) return 0;
  let added = 0;
  for (const entry of next) {
    const id = String((entry as any)?.id ?? "").trim();
    if (!id) {
      added += 1;
      continue;
    }
    if (!before.has(id)) added += 1;
  }
  return added;
}

async function loadSectionEntries(profileId: string, type: string): Promise<unknown[]> {
  const [section] = await db
    .select()
    .from(profileSections)
    .where(and(eq(profileSections.profileId, profileId), eq(profileSections.type, type)))
    .limit(1);
  return Array.isArray(section?.entries) ? (section!.entries as unknown[]) : [];
}

async function loadSkillEntries(profileId: string): Promise<unknown[]> {
  return loadSectionEntries(profileId, "skills");
}

// Helper to get or create profile
async function getOrCreateProfile(userId: string): Promise<typeof profiles.$inferSelect> {
  let profileList = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1);
  let profile = profileList[0];

  if (!profile) {
    try {
      const inserted = await db.insert(profiles).values({
        userId,
        headline: "",
        careerGoal: "",
        bio: "",
        completionPct: 0
      }).returning();
      profile = inserted[0];
      logger.info({ userId, profileId: profile.id }, "Created new empty profile");
    } catch (err: any) {
      profileList = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1);
      if (profileList[0]) {
        profile = profileList[0];
      } else {
        throw err;
      }
    }
  }
  return profile;
}

/**
 * Replace the user's uploaded resume: upload the new file, remove the old
 * upload from R2 + assets, and adjust storage usage. Returns the new URL.
 */
async function replaceUploadedResume(
  userId: string,
  user: typeof users.$inferSelect,
  file: { buffer: Buffer; originalname: string; mimetype: string; size: number },
): Promise<string> {
  const oldUrl = user.resumeUrl;
  const newUrl = await uploadToR2(file.buffer, file.originalname, file.mimetype);

  let reclaimedBytes = 0;
  if (oldUrl) {
    const [oldAsset] = await db
      .select()
      .from(assets)
      .where(and(eq(assets.userId, userId), eq(assets.url, oldUrl)))
      .limit(1);
    if (oldAsset) {
      reclaimedBytes = Number(oldAsset.sizeBytes) || 0;
      await db.delete(assets).where(eq(assets.id, oldAsset.id));
    }
    await deleteFromR2(oldUrl);
  }

  await db.insert(assets).values({
    userId,
    name: file.originalname || "Uploaded resume",
    url: newUrl,
    sizeBytes: file.size,
    sectionType: "resume",
  }).onConflictDoNothing();

  const currentUsed = Number(user.storageUsedBytes) || 0;
  const newUsed = Math.max(0, currentUsed - reclaimedBytes) + file.size;
  await db
    .update(users)
    .set({ resumeUrl: newUrl, storageUsedBytes: newUsed, defaultResume: "uploaded" })
    .where(eq(users.id, userId));

  return newUrl;
}

// GET /profile
router.get("/", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const userId = req.user!.id;
  try {
    const userList = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    const user = userList[0];
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const profile = await getOrCreateProfile(userId);
    const sections = await db.select().from(profileSections).where(eq(profileSections.profileId, profile.id));

    const getEntries = (type: string) => sections.find(s => s.type === type)?.entries || [];
    const contactEntries = sections.find(s => s.type === "contact")?.entries as any;

    const subscriptionState = await resolveSubscriptionState(userId);
    await syncStorageQuota(userId, subscriptionState.storageQuotaBytes, Number(user.storageQuotaBytes));
    const siteAccess = await resolveSiteAccess(userId);
    const limits = await getPlanLimits(subscriptionState.isPremium ? subscriptionState.plan : "free");
    const updatesUsage = await getUpdatesUsage(user, limits.updatesPerMonth);
    const parsesUsage = await getParsesUsage(user, limits.parsesPerMonth);

    const paymentsList = await db
      .select()
      .from(payments)
      .where(eq(payments.userId, userId))
      .orderBy(desc(payments.createdAt));

    // Public download button follows the default-resume preference.
    const effectiveResumeUrl =
      user.defaultResume === "uploaded"
        ? user.resumeUrl || user.generatedResumeUrl
        : user.generatedResumeUrl || user.resumeUrl;

    res.json({
      profile,
      user: {
        id: user.id,
        phone: user.phone,
        phoneVerifiedAt: user.phoneVerifiedAt,
        name: user.name,
        email: user.email,
        oauthProvider: user.oauthProvider,
        oauthId: user.oauthId,
        dob: user.dob,
        photoUrl: user.photoUrl,
        resumeUrl: effectiveResumeUrl,
        uploadedResumeUrl: user.resumeUrl,
        generatedResumeUrl: user.generatedResumeUrl,
        defaultResume: user.defaultResume || "generated",
        profilePhotoAssetId: user.profilePhotoAssetId,
        storageUsedBytes: user.storageUsedBytes,
        storageQuotaBytes: subscriptionState.storageQuotaBytes,
        storageBonusBytes: subscriptionState.storageBonusBytes,
        openToHire: user.openToHire ?? false,
        templateId: user.templateId ?? 'minimal',
        themeColor: user.themeColor ?? 'blue',
        themeBg: user.themeBg ?? 'grid',
        resumeParsesThisMonth: user.resumeParsesThisMonth ?? 0,
        lastResumeParseReset: user.lastResumeParseReset,
        onboardingSuccessfulParses: user.onboardingSuccessfulParses ?? 0,
        onboardingCompletedAt: user.onboardingCompletedAt,
      },
      plan: subscriptionState.plan,
      isPremium: subscriptionState.isPremium,
      canBuy: subscriptionState.canBuy,
      renewalMode: subscriptionState.renewalMode,
      expiresAt: subscriptionState.expiresAt,
      billingPeriod: subscriptionState.billingPeriod,
      addonBlocks: subscriptionState.addonBlocks,
      siteStatus: siteAccess.siteStatus,
      pauseReason: siteAccess.pauseReason,
      graceUntil: siteAccess.graceUntil,
      cancelAtPeriodEnd: siteAccess.cancelAtPeriodEnd,
      paymentFailedAt: siteAccess.paymentFailedAt,
      isInPaymentGrace: siteAccess.isInPaymentGrace,
      isPausedForVisitors: siteAccess.isPausedForVisitors,
      overStorage: siteAccess.overStorage,
      limits: {
        parsesPerMonth: limits.parsesPerMonth,
        updatesPerMonth: limits.updatesPerMonth,
        updatesUsed: updatesUsage.used,
        updatesRemaining: updatesUsage.remaining,
        updatesDaysToReset: updatesUsage.daysToReset,
        parsesUsed: parsesUsage.used,
        parsesRemaining: parsesUsage.remaining,
        parsesDaysToReset: parsesUsage.daysToReset,
      },
      autopay: !!subscriptionState.subscription?.razorpaySubscriptionId && !siteAccess.cancelAtPeriodEnd,
      aboutEntries: getEntries("about"),
      educationEntries: getEntries("education"),
      experienceEntries: getEntries("experience"),
      projectEntries: getEntries("projects"),
      certificateEntries: getEntries("certificates"),
      achievementEntries: getEntries("achievements"),
      researchEntries: getEntries("research"),
      skillEntries: getEntries("skills"),
      contactData: contactEntries || { email: user.email || "", phone: user.phone || "", linkedin: "", github: "", portfolio: "" },
      payments: paymentsList
    });
  } catch (err) {
    logger.error({ err, userId }, "Error fetching profile");
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * Verify a Supabase Auth access token and return the Google identity.
 * Prefers Auth API user lookup; falls back to JWT verify with SUPABASE_JWT_SECRET.
 */
async function verifySupabaseGoogleIdentity(
  accessToken: string,
): Promise<{ oauthId: string; email: string; name?: string; photoUrl?: string } | null> {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const jwtSecret = process.env.SUPABASE_JWT_SECRET;

  if (!supabaseUrl || !anonKey) {
    if (!jwtSecret) {
      logger.error(
        {
          hasSupabaseUrl: !!supabaseUrl,
          hasAnonKey: !!anonKey,
          hasJwtSecret: !!jwtSecret,
        },
        "Supabase env missing — set SUPABASE_URL + SUPABASE_ANON_KEY (or VITE_*) on the API, or SUPABASE_JWT_SECRET",
      );
      return null;
    }
  }

  if (supabaseUrl && anonKey) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      let resp: Response;
      try {
        resp = await fetch(`${supabaseUrl.replace(/\/$/, "")}/auth/v1/user`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            apikey: anonKey,
          },
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }
      if (resp.ok) {
        const user = (await resp.json()) as {
          id?: string;
          email?: string;
          user_metadata?: { full_name?: string; name?: string; avatar_url?: string; picture?: string };
          app_metadata?: { provider?: string; providers?: string[] };
          identities?: Array<{ provider?: string }>;
        };
        const providers = [
          ...(user.app_metadata?.providers || []),
          ...(user.identities || []).map((i) => i.provider).filter(Boolean) as string[],
        ];
        const provider = user.app_metadata?.provider;
        const isGoogle = provider === "google" || providers.includes("google");
        if (user.id && user.email && isGoogle) {
          return {
            oauthId: user.id,
            email: user.email.trim().toLowerCase(),
            name: user.user_metadata?.full_name || user.user_metadata?.name,
            photoUrl: user.user_metadata?.avatar_url || user.user_metadata?.picture,
          };
        }
        logger.warn(
          { hasId: !!user.id, hasEmail: !!user.email, provider, providers },
          "Supabase user is not a Google-linked identity",
        );
      } else {
        logger.warn({ status: resp.status }, "Supabase Auth /user returned non-OK");
      }
    } catch (err) {
      logger.warn({ err }, "Supabase Auth /user lookup failed");
    }
  }

  if (jwtSecret) {
    try {
      const decoded = jwt.verify(accessToken, jwtSecret) as {
        sub?: string;
        email?: string;
        user_metadata?: { full_name?: string; name?: string; avatar_url?: string };
        app_metadata?: { provider?: string };
      };
      if (decoded.sub && decoded.email) {
        return {
          oauthId: decoded.sub,
          email: decoded.email.trim().toLowerCase(),
          name: decoded.user_metadata?.full_name || decoded.user_metadata?.name,
          photoUrl: decoded.user_metadata?.avatar_url,
        };
      }
    } catch {
      // invalid token
    }
  }

  return null;
}

// POST /profile/link-google — bind Google OAuth identity from Supabase session to BEXO user
router.post("/link-google", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const userId = req.user!.id;
  const accessToken =
    typeof req.body?.accessToken === "string"
      ? req.body.accessToken.trim()
      : typeof req.body?.access_token === "string"
        ? req.body.access_token.trim()
        : "";

  if (!accessToken) {
    res.status(400).json({ error: "Missing Supabase accessToken." });
    return;
  }

  try {
    const identity = await verifySupabaseGoogleIdentity(accessToken);
    if (!identity) {
      const misconfigured =
        !(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL) ||
        !(process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY);
      if (misconfigured && !process.env.SUPABASE_JWT_SECRET) {
        res.status(503).json({
          error: "Google linking is misconfigured on the server. Contact support.",
          code: "SUPABASE_ENV_MISSING",
        });
        return;
      }
      res.status(401).json({ error: "Invalid or expired Google session. Please sign in with Google again." });
      return;
    }

    const { oauthId, email, name, photoUrl } = identity;

    const [emailOwner] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    if (emailOwner && emailOwner.id !== userId) {
      res.status(409).json({
        error: "This Google email is already linked to another BEXO account.",
        code: "EMAIL_TAKEN",
      });
      return;
    }

    const [oauthOwner] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.oauthProvider, "google"), eq(users.oauthId, oauthId)))
      .limit(1);
    if (oauthOwner && oauthOwner.id !== userId) {
      res.status(409).json({
        error: "This Google account is already linked to another BEXO account.",
        code: "OAUTH_TAKEN",
      });
      return;
    }

    const [current] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!current) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const userUpdates: Partial<typeof users.$inferInsert> = {
      email,
      oauthProvider: "google",
      oauthId,
    };
    if (!current.name && name) userUpdates.name = name;
    if (!current.photoUrl && photoUrl) userUpdates.photoUrl = photoUrl;

    await db.update(users).set(userUpdates).where(eq(users.id, userId));
    await markOnboardingActivity(userId);
    if (!current.email) {
      await enqueueWelcomeEmail(userId, email, name || current.name || "there");
    }

    logger.info({ userId, email }, "Linked Google OAuth to user");
    res.json({
      success: true,
      user: {
        id: userId,
        email,
        oauthProvider: "google",
        oauthId,
        name: userUpdates.name ?? current.name,
        photoUrl: userUpdates.photoUrl ?? current.photoUrl,
      },
    });
  } catch (err: any) {
    if (err?.code === "23505") {
      res.status(409).json({
        error: "This Google email or account is already linked to another BEXO account.",
        code: "EMAIL_TAKEN",
      });
      return;
    }
    logger.error({ err, userId }, "Error linking Google account");
    res.status(500).json({ error: "Could not link Google account. Please try again." });
  }
});

// PATCH /profile
router.patch("/", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const userId = req.user!.id;
    const { 
      name, dob, email, photoUrl, resumeUrl, handle, headline, careerGoal, bio, completionPct, profilePhotoAssetId,
      openToHire, templateId, themeColor, themeBg, pronouns, nationality,
      aboutEntries, educationEntries, experienceEntries, projectEntries, certificateEntries, achievementEntries, researchEntries, skillEntries, contactData
    } = req.body;
    try {
      // Resolve premium status for gating
      const subscriptionState = await resolveSubscriptionState(userId);
      const isPremium = subscriptionState.isPremium;
  
      // Gate template selection for free users
      if (templateId !== undefined && templateId !== 'minimal' && !isPremium) {
        res.status(403).json({
          error:
            "Premium templates require a Pro subscription. Upgrade to unlock Cura Futuri, Sierra Montana, and Nico Palmer.",
        });
        return;
      }
  
      // Update user info if name, dob, etc. is provided
      const userUpdates: Partial<typeof users.$inferInsert> = {};
      if (name !== undefined) userUpdates.name = name;
      if (dob !== undefined) userUpdates.dob = dob;
      if (email !== undefined) {
        const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : email;
        if (normalizedEmail) {
          // Enforce email uniqueness with a friendly 409 instead of a DB constraint error
          const [emailOwner] = await db
            .select({ id: users.id })
            .from(users)
            .where(eq(users.email, normalizedEmail))
            .limit(1);
          if (emailOwner && emailOwner.id !== userId) {
            res.status(409).json({
              error: "This email is already linked to another BEXO account. Sign in with that account or use a different email.",
              code: "EMAIL_TAKEN",
            });
            return;
          }
        }
        userUpdates.email = normalizedEmail;
      }
      if (photoUrl !== undefined) userUpdates.photoUrl = photoUrl;
      // resumeUrl is intentionally ignored here: the uploaded-resume slot is
      // managed only by the dedicated resume-file endpoints so a client echoing
      // a generated URL can never clobber a real upload.
      if (profilePhotoAssetId !== undefined) userUpdates.profilePhotoAssetId = profilePhotoAssetId;
      if (openToHire !== undefined) userUpdates.openToHire = !!openToHire;
      if (templateId !== undefined) userUpdates.templateId = templateId;
      if (themeColor !== undefined) userUpdates.themeColor = themeColor;
      if (themeBg !== undefined) userUpdates.themeBg = themeBg;
  
      if (Object.keys(userUpdates).length > 0) {
        const [before] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
        await db.update(users).set(userUpdates).where(eq(users.id, userId));
        await markOnboardingActivity(userId);
        if (email && !before?.email) {
          await enqueueWelcomeEmail(userId, email, name || before?.name || "there");
        }
      } else {
        await markOnboardingActivity(userId);
      }

    // Update profile info
    const profile = await getOrCreateProfile(userId);
    const profileUpdates: Partial<typeof profiles.$inferInsert> & {
      pronouns?: string | null;
      nationality?: string | null;
    } = {};
    
    if (handle !== undefined && handle !== profile.handle) {
      const normalizedHandle =
        typeof handle === "string" ? handle.toLowerCase().trim() : "";
      if (!normalizedHandle || !/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/.test(normalizedHandle) || normalizedHandle.length > 40) {
        res.status(400).json({ error: "Handle must be 1–40 characters: letters, numbers, dots, or hyphens." });
        return;
      }
      if (
        normalizedHandle === MARKETING_DEMO_HANDLE ||
        normalizedHandle === "bexo" ||
        normalizedHandle === "www" ||
        normalizedHandle === "api" ||
        normalizedHandle === "admin" ||
        normalizedHandle === "support"
      ) {
        res.status(400).json({ error: "That handle is reserved." });
        return;
      }
      if (normalizedHandle === profile.handle) {
        // no-op (already owned, possibly different casing in request)
      } else {
        const existing = await db
          .select()
          .from(profiles)
          .where(eq(profiles.handle, normalizedHandle))
          .limit(1);
        if (existing.length > 0) {
          res.status(409).json({ error: "Handle is already taken", code: "HANDLE_TAKEN" });
          return;
        }
        profileUpdates.handle = normalizedHandle;
      }
    }

    if (headline !== undefined) profileUpdates.headline = headline;
    if (careerGoal !== undefined) profileUpdates.careerGoal = careerGoal;
    if (bio !== undefined) profileUpdates.bio = bio;
    if (pronouns !== undefined) {
      profileUpdates.pronouns =
        typeof pronouns === "string" ? pronouns.trim().slice(0, 40) || null : null;
    }
    if (nationality !== undefined) {
      profileUpdates.nationality =
        typeof nationality === "string" ? nationality.trim().slice(0, 80) || null : null;
    }
    if (completionPct !== undefined) profileUpdates.completionPct = completionPct;
    // Keep profile.templateId in sync — subdomain router prefers this field.
    if (templateId !== undefined) profileUpdates.templateId = templateId;
    if (isPremium && templateId !== undefined && templateId !== "minimal") {
      profileUpdates.isPremium = true;
      if (!profile.subdomain && profile.handle) {
        profileUpdates.subdomain = profile.handle;
      }
    }

    if (Object.keys(profileUpdates).length > 0) {
      await db.update(profiles).set(profileUpdates).where(eq(profiles.id, profile.id));
    }

    // Save sections if provided
    const sectionsToSave = [
      { type: "about", entries: aboutEntries },
      { type: "education", entries: educationEntries },
      { type: "experience", entries: experienceEntries },
      { type: "projects", entries: projectEntries },
      { type: "certificates", entries: certificateEntries },
      { type: "achievements", entries: achievementEntries },
      { type: "research", entries: researchEntries },
      {
        type: "skills",
        entries:
          skillEntries !== undefined
            ? normalizeSkills(skillEntries).slice(0, MAX_SKILLS)
            : undefined,
      },
      { type: "contact", entries: contactData }
    ];

    // After onboarding: net-new list entries + new skills consume monthly update credits.
    // Pure edits / deletes / reorders of existing rows are free.
    const [gateUser] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (gateUser?.onboardingCompletedAt) {
      const meteredTypes = [
        "education",
        "experience",
        "projects",
        "certificates",
        "achievements",
        "research",
      ] as const;
      let creditsNeeded = 0;

      for (const type of meteredTypes) {
        const incoming = sectionsToSave.find((s) => s.type === type)?.entries;
        if (incoming === undefined) continue;
        const existing = await loadSectionEntries(profile.id, type);
        creditsNeeded += countNetNewEntries(existing, incoming);
      }

      if (skillEntries !== undefined) {
        const existingSkills = await loadSkillEntries(profile.id);
        if (skillsContainAdditions(existingSkills, skillEntries)) {
          const beforeNames = new Set(
            normalizeSkills(existingSkills).map((s) => s.name.toLowerCase()),
          );
          creditsNeeded += normalizeSkills(skillEntries).filter(
            (s) => !beforeNames.has(s.name.toLowerCase()),
          ).length;
        }
      }

      if (creditsNeeded > 0) {
        const planLimits = await getPlanLimits(isPremium ? subscriptionState.plan : "free");
        const usage = await getUpdatesUsage(gateUser, planLimits.updatesPerMonth);
        if (usage.remaining < creditsNeeded) {
          res.status(403).json({
            error: `You need ${creditsNeeded} profile update credit(s) to add these entries, but only ${usage.remaining} remain this month. Resets in ${usage.daysToReset} day(s).`,
            code: "UPDATE_LIMIT",
            needed: creditsNeeded,
            remaining: usage.remaining,
            daysToReset: usage.daysToReset,
          });
          return;
        }
        for (let i = 0; i < creditsNeeded; i += 1) {
          const ok = await consumeUpdate(userId, planLimits.updatesPerMonth);
          if (!ok) {
            res.status(403).json({
              error: `You have used all ${planLimits.updatesPerMonth} profile update(s) included in your plan this month.`,
              code: "UPDATE_LIMIT",
            });
            return;
          }
        }
      }
    }

    for (const sec of sectionsToSave) {
      if (sec.entries !== undefined) {
        await db.insert(profileSections).values({
          profileId: profile.id,
          type: sec.type,
          entries: sec.entries,
          reviewedAt: new Date()
        }).onConflictDoUpdate({
          target: [profileSections.profileId, profileSections.type],
          set: { entries: sec.entries, reviewedAt: new Date() }
        });
      }
    }
    
    // Auto-generate resume PDF if needed
    await autoGenerateResumeIfNeeded(userId);

    // Fresh edits must be visible on the public page immediately
    if (profile.handle) { publicProfileCache.delete(profile.handle); invalidatePortfolioRenderCache(profile.handle); }

    res.json({ success: true, message: "Profile updated successfully" });
  } catch (err) {
    // Unique-constraint race (handle / email / phone)
    if ((err as { code?: string })?.code === "23505") {
      const constraint = String((err as { constraint?: string }).constraint ?? "");
      const msg = String((err as { message?: string }).message ?? "");
      logger.warn({ err, userId, constraint }, "Unique constraint conflict on profile update");
      if (constraint.includes("handle") || msg.includes("handle")) {
        res.status(409).json({
          error: "That handle was just claimed by someone else. Try another.",
          code: "HANDLE_TAKEN",
        });
        return;
      }
      res.status(409).json({
        error: "That email or phone number is already linked to another BEXO account.",
        code: "DUPLICATE_CONTACT",
      });
      return;
    }
    logger.error({ err, userId }, "Error updating profile");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /profile/check-handle
router.get("/check-handle", optionalAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const handle = req.query.handle as string;
  if (!handle) {
    res.status(400).json({ error: "Handle query parameter is required" });
    return;
  }
  try {
    const normalized = handle.toLowerCase().trim();
    if (
      normalized === MARKETING_DEMO_HANDLE ||
      normalized === "bexo" ||
      normalized === "www" ||
      normalized === "api" ||
      normalized === "admin" ||
      normalized === "support"
    ) {
      res.json({ available: false, reason: "reserved" });
      return;
    }
    const existing = await db
      .select()
      .from(profiles)
      .where(eq(profiles.handle, normalized))
      .limit(1);
    const taken = existing.length > 0 && (!req.user || existing[0].userId !== req.user.id);
    res.json({ available: !taken });
  } catch (err) {
    logger.error({ err, handle }, "Error checking handle availability");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /profile/suggest-handle
router.get("/suggest-handle", optionalAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const firstName = (req.query.firstName as string || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  const lastName = (req.query.lastName as string || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  
  if (!firstName) {
    res.status(400).json({ error: "firstName query parameter is required" });
    return;
  }

  try {

    // Generate candidates
    const candidates: string[] = [];
    
    // Candidate 1: firstname (e.g. kavin)
    candidates.push(firstName);

    // Candidate 2: firstnamelastname (e.g. kavinbalaji)
    if (lastName) {
      candidates.push(`${firstName}${lastName}`);
      // Candidate 3: firstname-lastname (e.g. kavin-balaji)
      candidates.push(`${firstName}-${lastName}`);
      // Candidate 4: firstname.lastname (e.g. kavin.balaji)
      candidates.push(`${firstName}.${lastName}`);
    }

    // Candidate 5: firstname + random 3 digit number (e.g. kavin184)
    for (let i = 0; i < 5; i++) {
      const rand = Math.floor(100 + Math.random() * 900);
      candidates.push(`${firstName}${rand}`);
    }

    const uniqueCandidates = Array.from(new Set(candidates.filter(Boolean)));
    const matches = uniqueCandidates.length
      ? await db
          .select({ handle: profiles.handle, userId: profiles.userId })
          .from(profiles)
          .where(inArray(profiles.handle, uniqueCandidates))
      : [];

    const selfId = req.user?.id;
    const takenHandles = new Set(
      matches
        .filter((p) => !selfId || p.userId !== selfId)
        .map((p) => p.handle?.toLowerCase())
        .filter(Boolean) as string[],
    );

    // Find the first candidate that isn't taken
    let suggestedHandle = uniqueCandidates[0];
    for (const cand of uniqueCandidates) {
      if (!takenHandles.has(cand)) {
        suggestedHandle = cand;
        break;
      }
    }

    res.json({ suggestedHandle });
  } catch (err) {
    logger.error({ err, firstName, lastName }, "Error suggesting handle");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /profile/sections/:type
router.get("/sections/:type", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const userId = req.user!.id;
  const type = req.params.type as string;
  try {
    const profile = await getOrCreateProfile(userId);
    const sections = await db.select().from(profileSections).where(
      and(eq(profileSections.profileId, profile.id), eq(profileSections.type, type))
    ).limit(1);

    res.json(sections[0] || { profileId: profile.id, type, entries: [] });
  } catch (err) {
    logger.error({ err, userId, type }, "Error fetching profile section");
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /profile/sections/:type
router.patch("/sections/:type", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const userId = req.user!.id;
  const type = req.params.type as string;
  const { entries } = req.body;

  if (!Array.isArray(entries)) {
    res.status(400).json({ error: "Entries must be an array" });
    return;
  }

  try {
    const profile = await getOrCreateProfile(userId);
    let nextEntries = entries;
    const [gateUser] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    const meteredList =
      gateUser?.onboardingCompletedAt &&
      ["education", "experience", "projects", "certificates", "achievements", "research"].includes(type);

    let creditsNeeded = 0;
    if (type === "skills") {
      nextEntries = normalizeSkills(entries).slice(0, MAX_SKILLS);
      if (gateUser?.onboardingCompletedAt) {
        const existingSkills = await loadSkillEntries(profile.id);
        if (skillsContainAdditions(existingSkills, nextEntries)) {
          const beforeNames = new Set(
            normalizeSkills(existingSkills).map((s) => s.name.toLowerCase()),
          );
          creditsNeeded = normalizeSkills(nextEntries).filter(
            (s) => !beforeNames.has(s.name.toLowerCase()),
          ).length;
        }
      }
    } else if (meteredList) {
      const existing = await loadSectionEntries(profile.id, type);
      creditsNeeded = countNetNewEntries(existing, nextEntries);
    }

    if (creditsNeeded > 0) {
      const sub = await resolveSubscriptionState(userId);
      const planLimits = await getPlanLimits(sub.isPremium ? sub.plan : "free");
      const usage = await getUpdatesUsage(gateUser!, planLimits.updatesPerMonth);
      if (usage.remaining < creditsNeeded) {
        res.status(403).json({
          error: `You need ${creditsNeeded} profile update credit(s), but only ${usage.remaining} remain this month.`,
          code: "UPDATE_LIMIT",
          needed: creditsNeeded,
          remaining: usage.remaining,
        });
        return;
      }
      for (let i = 0; i < creditsNeeded; i += 1) {
        const ok = await consumeUpdate(userId, planLimits.updatesPerMonth);
        if (!ok) {
          res.status(403).json({
            error: `You have used all ${planLimits.updatesPerMonth} profile update(s) this month.`,
            code: "UPDATE_LIMIT",
          });
          return;
        }
      }
    }

    // Upsert section
    await db.insert(profileSections).values({
      profileId: profile.id,
      type,
      entries: nextEntries,
      reviewedAt: new Date()
    }).onConflictDoUpdate({
      target: [profileSections.profileId, profileSections.type],
      set: { entries: nextEntries, reviewedAt: new Date() }
    });

    // Auto-generate resume PDF if needed
    await autoGenerateResumeIfNeeded(userId);

    res.json({ success: true, message: `Profile section ${type} updated successfully` });
  } catch (err) {
    logger.error({ err, userId, type }, "Error updating profile section");
    res.status(500).json({ error: "Internal server error" });
  }
});
function normalizeParsedData(raw: any): any {
  const data = raw || {};
  const res: any = {
    name: typeof data.name === "string" ? data.name : "",
    headline: typeof data.headline === "string" ? data.headline : "",
    bio: typeof data.bio === "string" ? data.bio : "",
    email: typeof data.email === "string" ? data.email : "",
    phone: typeof data.phone === "string" ? data.phone : "",
    pronouns: typeof data.pronouns === "string" ? data.pronouns : "He/Him",
    links: [],
    education: [],
    experience: [],
    projects: [],
    certificates: [],
    achievements: [],
    skills: [],
  };

  // Links normalization
  if (Array.isArray(data.links)) {
    res.links = data.links.map((l: any) => {
      if (typeof l === "string") return { name: "Link", url: l };
      if (l && typeof l === "object") {
        return { name: String(l.name || l.title || "Link"), url: String(l.url || l.href || "") };
      }
      return null;
    }).filter(Boolean);
  } else if (data.links && typeof data.links === "object") {
    res.links = Object.entries(data.links).map(([name, url]) => ({
      name,
      url: typeof url === "string" ? url : ""
    }));
  }

  // Education normalization
  if (Array.isArray(data.education)) {
    res.education = data.education.filter((edu: any) => edu && typeof edu === "object");
  } else if (data.education && typeof data.education === "object") {
    res.education = [data.education];
  }

  // Experience normalization
  if (Array.isArray(data.experience)) {
    res.experience = data.experience.filter((exp: any) => exp && typeof exp === "object");
  } else if (data.experience && typeof data.experience === "object") {
    res.experience = [data.experience];
  }

  // Projects normalization
  if (Array.isArray(data.projects)) {
    res.projects = data.projects.filter((proj: any) => proj && typeof proj === "object");
  } else if (data.projects && typeof data.projects === "object") {
    res.projects = [data.projects];
  }

  // Certificates normalization
  if (Array.isArray(data.certificates)) {
    res.certificates = data.certificates.filter((cert: any) => cert && typeof cert === "object");
  } else if (data.certificates && typeof data.certificates === "object") {
    res.certificates = [data.certificates];
  }

  // Achievements normalization
  if (Array.isArray(data.achievements)) {
    res.achievements = data.achievements.filter((ach: any) => ach && typeof ach === "object");
  } else if (data.achievements && typeof data.achievements === "object") {
    res.achievements = [data.achievements];
  }

  // Skills — AI list + tech strings from projects as fallback
  const skillSeed: unknown[] = Array.isArray(data.skills) ? [...data.skills] : [];
  if (typeof data.skills === "string" && data.skills.trim()) {
    skillSeed.push(...data.skills.split(/[,|;/]/).map((s: string) => s.trim()).filter(Boolean));
  }
  for (const proj of res.projects) {
    const tech = typeof proj.tech === "string" ? proj.tech : typeof proj.techStack === "string" ? proj.techStack : "";
    if (tech) {
      for (const part of tech.split(/[,|;/]/)) {
        const t = part.trim();
        if (t) skillSeed.push({ name: t, category: "technical" });
      }
    }
  }
  res.skills = normalizeSkills(skillSeed);

  return res;
}

// POST /profile/resume
router.post("/resume", requireAuth, upload.single("resume"), async (req: AuthenticatedRequest, res): Promise<void> => {
  const userId = req.user!.id;
  const file = req.file;

  if (!file) {
    res.status(400).json({ error: "No resume file uploaded" });
    return;
  }

  if (file.mimetype !== "application/pdf") {
    res.status(400).json({ error: "Only PDF files are supported" });
    return;
  }

  // Retrieve current subscription state for parsing limits
  const subscriptionState = await resolveSubscriptionState(userId);
  const plan = subscriptionState.plan; // "annual" | "lifetime" | "free" | null

  // 2. Fetch user record for parsing limit count
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const now = new Date();
  const duringOnboarding = !user.onboardingCompletedAt;
  const fileHash = crypto.createHash("sha256").update(file.buffer).digest("hex");
  const ipHash = crypto
    .createHash("sha256")
    .update(String(req.headers["x-forwarded-for"] || req.ip || ""))
    .digest("hex")
    .slice(0, 32);

  // One in-flight parse per user
  const [inflight] = await db
    .select()
    .from(resumeParseAttempts)
    .where(and(eq(resumeParseAttempts.userId, userId), eq(resumeParseAttempts.status, "started")))
    .limit(1);
  if (inflight) {
    res.status(429).json({ error: "A resume parse is already in progress. Please wait for it to finish." });
    return;
  }

  // Abuse throttle: max 8 attempt starts / hour / user (does not consume success quota)
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recentAttempts = await db
    .select({ count: sql<number>`count(*)` })
    .from(resumeParseAttempts)
    .where(and(eq(resumeParseAttempts.userId, userId), gt(resumeParseAttempts.createdAt, oneHourAgo)));
  if (Number(recentAttempts[0]?.count || 0) >= 8) {
    res.status(429).json({ error: "Too many resume parse attempts. Please wait and try again later." });
    return;
  }

  // Return cached successful parse for identical file without consuming another credit
  const [cached] = await db
    .select()
    .from(resumeParseAttempts)
    .where(
      and(
        eq(resumeParseAttempts.userId, userId),
        eq(resumeParseAttempts.fileHash, fileHash),
        eq(resumeParseAttempts.status, "succeeded"),
      ),
    )
    .orderBy(desc(resumeParseAttempts.createdAt))
    .limit(1);

  if (duringOnboarding) {
    // Independent of payment: 1 successful parse during onboarding
    const onboardingUsed = user.onboardingSuccessfulParses || 0;
    if (!cached && onboardingUsed >= ONBOARDING_PARSE_LIMIT) {
      res.status(429).json({
        error: "You have used your onboarding resume parse. Continue with manual edits, or finish onboarding to unlock plan-based parsing.",
      });
      return;
    }
  } else {
    const limits = await getPlanLimits(subscriptionState.isPremium ? plan : "free");

    if (limits.parsesPerMonth <= 0) {
      res.status(429).json({
        error: "AI resume parsing is a paid feature. Upgrade to Identity, Essential, Growth, or Student+ to parse resumes.",
        code: "UPGRADE_REQUIRED",
      });
      return;
    }

    const usage = await getParsesUsage(user, limits.parsesPerMonth);
    if (!cached && usage.remaining <= 0) {
      res.status(429).json({
        error: `You have reached your AI resume parsing limit of ${limits.parsesPerMonth} successful parse(s) on the ${limits.planDisplay} plan. Quota resets in ${usage.daysToReset} days.`,
        code: "LIMIT_REACHED",
      });
      return;
    }
  }

  const [attempt] = await db
    .insert(resumeParseAttempts)
    .values({
      userId,
      status: "started",
      fileHash,
      fileName: file.originalname,
      fileSizeBytes: file.size,
      duringOnboarding,
      ipHash,
    })
    .returning();

  // Upload resume to R2 inside a wrapper variable
  let resumeUrl = "";

  try {
    logger.info({ userId, fileName: file.originalname, attemptId: attempt.id }, "Starting resume processing");
    await markOnboardingActivity(userId);

    // Storage quota guard (same spirit as /upload)
    const quota = subscriptionState.storageQuotaBytes;
    const currentUsed = Number(user.storageUsedBytes) || 0;
    if (user.onboardingCompletedAt && currentUsed + file.size > quota) {
      await db
        .update(resumeParseAttempts)
        .set({ status: "failed", errorMessage: "Storage quota exceeded", completedAt: new Date() })
        .where(eq(resumeParseAttempts.id, attempt.id));
      res.status(403).json({ error: "Storage limit exceeded. Free up space or upgrade your plan." });
      return;
    }

    try {
      resumeUrl = await replaceUploadedResume(userId, user, file);
      logger.info({ userId, resumeUrl }, "Successfully uploaded resume to R2 and updated user record");
    } catch (r2Err) {
      logger.error({ r2Err, userId }, "Failed to upload resume to R2");
    }

    // 1. Extract text from PDF
    const parsedPdf = await pdf(file.buffer);
    const resumeText = parsedPdf.text || "";

    if (!resumeText.trim()) {
      res.status(400).json({ error: "Could not extract any text from the PDF resume" });
      return;
    }

    // 2. Parse text with resilient AI engine (OpenRouter -> Grok -> Gemini -> Offline Rule Engine)
    const { data: rawParsed, winningProvider } = await executeResilientResumeParsing(resumeText);
    const parsedData = normalizeParsedData(rawParsed);
    logger.info({ userId, winningProvider }, "Resume parsing completed via AI Resilience Engine");

    const profile = await getOrCreateProfile(userId);
    
    // Save user name and email
    if (parsedData.name) {
      try {
        await db.update(users).set({ 
          name: parsedData.name, 
          email: parsedData.email || undefined 
        }).where(eq(users.id, userId));
      } catch (dbErr: any) {
        logger.warn({ err: dbErr.message, userId, email: parsedData.email }, "Failed to update user name/email, trying name only");
        try {
          await db.update(users).set({ 
            name: parsedData.name 
          }).where(eq(users.id, userId));
        } catch (nameErr: any) {
          logger.error({ err: nameErr.message, userId }, "Failed to update name only");
        }
      }
    }

    await db.update(profiles).set({
      headline: parsedData.headline || "",
      bio: parsedData.bio || ""
    }).where(eq(profiles.id, profile.id));

    // Construct contactData
    const contactLinks = parsedData.links || [];
    const linkedin = contactLinks.find((l: any) => l.name?.toLowerCase().includes("linkedin"))?.url || "";
    const github = contactLinks.find((l: any) => l.name?.toLowerCase().includes("github"))?.url || "";
    const portfolio = contactLinks.find((l: any) => !l.name?.toLowerCase().includes("linkedin") && !l.name?.toLowerCase().includes("github"))?.url || "";

    const contactData = {
      email: parsedData.email || "",
      phone: parsedData.phone || "",
      linkedin,
      github,
      portfolio,
      customLinks: contactLinks
    };

    const defaultAssets = { mode: "images", images: [], pdfs: [], links: [] };

    const latestEdu = parsedData.education && parsedData.education.length > 0 ? `${parsedData.education[0].degree} at ${parsedData.education[0].institution}` : '';
    const latestExp = parsedData.experience && parsedData.experience.length > 0 ? `${parsedData.experience[0].role} at ${parsedData.experience[0].company}` : '';
    const currentStatus = latestExp || latestEdu || '';

    const sectionsToSave = [
      { type: "about", entries: [{ id: "1", title: parsedData.headline || "Software Engineer Intern", description: parsedData.bio || "", currentStatus }] },
      {
        type: "education",
        entries: (parsedData.education || []).map((edu: any, idx: number) => {
          let startYear = "";
          let endYear = "";
          const yr = edu.year || "";
          if (yr.includes("-")) {
            const parts = yr.split("-");
            startYear = parts[0]?.trim() || "";
            endYear = parts[1]?.trim() || "";
          } else {
            endYear = yr;
          }
          return {
            id: edu.id || String(idx + 1),
            institution: edu.institution || "",
            degree: edu.degree || "",
            startYear,
            endYear,
            year: yr,
            grade: edu.grade || ""
          };
        })
      },
      {
        type: "experience",
        entries: (parsedData.experience || []).map((exp: any, idx: number) => {
          let startYear = "";
          let endYear = "";
          const dur = exp.duration || "";
          if (dur.includes("-")) {
            const parts = dur.split("-");
            startYear = parts[0]?.trim() || "";
            endYear = parts[1]?.trim() || "";
          } else {
            endYear = dur;
          }
          return {
            id: exp.id || String(idx + 1),
            company: exp.company || "",
            role: exp.role || "",
            startYear,
            endYear,
            duration: dur,
            description: exp.description || ""
          };
        })
      },
      {
        type: "projects",
        entries: (parsedData.projects || []).map((proj: any, idx: number) => ({
          id: proj.id || String(idx + 1),
          title: proj.title || "",
          description: proj.description || "",
          tech: proj.tech || "",
          link: proj.link || "",
          assets: proj.assets || defaultAssets
        }))
      },
      {
        type: "certificates",
        entries: (parsedData.certificates || []).map((cert: any, idx: number) => ({
          id: cert.id || String(idx + 1),
          title: cert.title || "",
          issuer: cert.issuer || "",
          date: cert.date || "",
          assets: cert.assets || defaultAssets
        }))
      },
      {
        type: "achievements",
        entries: (parsedData.achievements || []).map((ach: any, idx: number) => ({
          id: ach.id || String(idx + 1),
          title: ach.title || "",
          organization: ach.organization || "",
          date: ach.date || "",
          assets: ach.assets || defaultAssets
        }))
      },
      {
        type: "skills",
        entries: normalizeSkills(parsedData.skills || []).slice(0, MAX_SKILLS),
      },
      { type: "contact", entries: contactData }
    ];

    // Fetch existing profile sections to merge data
    const existingSections = await db.select().from(profileSections).where(eq(profileSections.profileId, profile.id));

    for (const sec of sectionsToSave) {
      const existingSec = existingSections.find(s => s.type === sec.type);
      let mergedEntries: any = sec.entries;

      if (existingSec && Array.isArray(existingSec.entries)) {
        const existingEntries = existingSec.entries;

        if (sec.type === "about") {
          // Merge "about" fields, preserving existing if filled
          const existingAbout = existingEntries[0] || {};
          const newAbout = sec.entries[0] || {};
          mergedEntries = [{
            id: "1",
            title: existingAbout.title || newAbout.title || "",
            description: existingAbout.description || newAbout.description || "",
            currentStatus: existingAbout.currentStatus || newAbout.currentStatus || ""
          }];
        } else if (sec.type === "contact") {
          // Merge "contact" fields
          const existingContact = existingEntries as any;
          const newContact = sec.entries as any;
          mergedEntries = {
            email: existingContact.email || newContact.email || "",
            phone: existingContact.phone || newContact.phone || "",
            linkedin: existingContact.linkedin || newContact.linkedin || "",
            github: existingContact.github || newContact.github || "",
            portfolio: existingContact.portfolio || newContact.portfolio || "",
            customLinks: Array.isArray(newContact.customLinks) ? newContact.customLinks : (Array.isArray(existingContact.customLinks) ? existingContact.customLinks : [])
          };
        } else {
          // For list-based sections (education, experience, projects, certificates, achievements)
          // Overwrite existing data with newly parsed data, removing old data completely
          const incomingEntries = sec.entries || [];
          let nextIdIdx = 1;
          const updatedIncoming = incomingEntries.map((item: any) => ({
            ...item,
            id: String(nextIdIdx++)
          }));

          mergedEntries = updatedIncoming;
        }
      }

      await db.insert(profileSections).values({
        profileId: profile.id,
        type: sec.type,
        entries: mergedEntries,
        reviewedAt: new Date()
      }).onConflictDoUpdate({
        target: [profileSections.profileId, profileSections.type],
        set: { entries: mergedEntries, reviewedAt: new Date() }
      });
    }

    // Only successful parses consume entitlement
    if (duringOnboarding) {
      await db
        .update(users)
        .set({
          onboardingSuccessfulParses: sql`coalesce(${users.onboardingSuccessfulParses}, 0) + 1`,
          lastOnboardingActivityAt: new Date(),
        })
        .where(eq(users.id, userId));
    } else {
      await db
        .update(users)
        .set({
          resumeParsesThisMonth: sql`coalesce(${users.resumeParsesThisMonth}, 0) + 1`,
        })
        .where(eq(users.id, userId));
    }

    await db
      .update(resumeParseAttempts)
      .set({
        status: "succeeded",
        consumedQuota: true,
        completedAt: new Date(),
        model: "openrouter",
      })
      .where(eq(resumeParseAttempts.id, attempt.id));

    res.json({
      success: true,
      message: "Resume processed and profile updated successfully",
      data: parsedData,
      resumeUrl: resumeUrl || undefined,
      cached: false,
    });
  } catch (err: any) {
    logger.error({ err, userId }, "Error processing resume");
    if (attempt?.id) {
      const timedOut = String(err?.message || "").toLowerCase().includes("timed out");
      await db
        .update(resumeParseAttempts)
        .set({
          status: timedOut ? "timed_out" : "failed",
          errorMessage: err?.message || "Failed to process resume",
          completedAt: new Date(),
        })
        .where(eq(resumeParseAttempts.id, attempt.id));
    }
    res.status(500).json({ error: err.message || "Failed to process resume" });
  }
});

// POST /profile/upload
router.post("/upload", requireAuth, upload.single("file"), async (req: AuthenticatedRequest, res): Promise<void> => {
  const userId = req.user!.id;
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }

  try {
    // Enforce storage quota
    const userList = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    const user = userList[0];
    if (user) {
      const subscriptionState = await resolveSubscriptionState(userId);
      const quota = subscriptionState.storageQuotaBytes;
      await syncStorageQuota(userId, quota, Number(user.storageQuotaBytes));

      const currentUsed = Number(user.storageUsedBytes) || 0;
      if (user.onboardingCompletedAt && currentUsed + file.size > quota) {
        const usedMB = (currentUsed / 1024 / 1024).toFixed(1);
        const quotaMB = (quota / 1024 / 1024).toFixed(0);
        const fileMB = (file.size / 1024 / 1024).toFixed(1);
        res.status(403).json({ 
          error: `Storage limit exceeded. You've used ${usedMB}MB of ${quotaMB}MB. This file is ${fileMB}MB. Upgrade to Pro for more storage.` 
        });
        return;
      }
    }

    const url = await uploadToR2(file.buffer, file.originalname, file.mimetype);

    // Track every upload in the assets ledger for the storage manager
    const sectionType = typeof req.body?.sectionType === "string" ? req.body.sectionType : null;
    const entryId = typeof req.body?.entryId === "string" ? req.body.entryId : null;
    await db.insert(assets).values({
      userId,
      name: file.originalname || "file",
      url,
      sizeBytes: file.size,
      sectionType,
      entryId,
    }).onConflictDoNothing();

    // Update storage usage tracking
    if (user) {
      const newUsed = (Number(user.storageUsedBytes) || 0) + file.size;
      await db.update(users).set({ storageUsedBytes: newUsed }).where(eq(users.id, userId));
    }

    res.json({
      success: true,
      url,
      name: file.originalname,
      sizeBytes: file.size
    });
  } catch (err: any) {
    logger.error({ err }, "Error uploading to R2");
    res.status(500).json({ error: err.message || "Failed to upload file to R2" });
  }
});

// POST /profile/public/:handle/contact — public enquiry form
router.post("/public/:handle/contact", async (req, res): Promise<void> => {
  const { handle } = req.params;
  const name = String(req.body?.name || "").trim();
  const email = String(req.body?.email || "").trim().toLowerCase();
  const phone = String(req.body?.phone || "").trim();
  const message = String(req.body?.message || "").trim();
  const honeypot = String(req.body?.website || "").trim();

  if (honeypot) {
    res.json({ success: true, message: "Message received." });
    return;
  }

  if (name.length < 2 || name.length > 120) {
    res.status(400).json({ error: "Please enter a valid name." });
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) {
    res.status(400).json({ error: "Please enter a valid email address." });
    return;
  }
  if (message.length < 10 || message.length > 4000) {
    res.status(400).json({ error: "Message must be between 10 and 4000 characters." });
    return;
  }
  if (phone && phone.length > 40) {
    res.status(400).json({ error: "Phone number is too long." });
    return;
  }

  try {
    if (isMarketingDemoHandle(handle)) {
      // Fictional landing showcase — accept form but do not persist
      res.json({ success: true, message: "Demo preview — message was not delivered." });
      return;
    }

    const [profile] = await db.select().from(profiles).where(eq(profiles.handle, handle)).limit(1);
    if (!profile) {
      res.status(404).json({ error: "Portfolio not found." });
      return;
    }

    const [owner] = await db.select().from(users).where(eq(users.id, profile.userId)).limit(1);
    if (!owner) {
      res.status(404).json({ error: "Portfolio owner not found." });
      return;
    }

    const sections = await db.select().from(profileSections).where(eq(profileSections.profileId, profile.id));
    const contactEntries = sections.find((s) => s.type === "contact")?.entries as any;
    const ownerEmail = String(contactEntries?.email || owner.email || "").trim();
    if (!ownerEmail) {
      res.status(409).json({ error: "This portfolio does not accept messages yet." });
      return;
    }

    const ipHash = crypto
      .createHash("sha256")
      .update(String(req.headers["x-forwarded-for"] || req.ip || ""))
      .digest("hex")
      .slice(0, 32);

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recent = await db
      .select({ count: sql<number>`count(*)` })
      .from(contactSubmissions)
      .where(
        and(
          eq(contactSubmissions.handle, handle),
          eq(contactSubmissions.ipHash, ipHash),
          gt(contactSubmissions.createdAt, oneHourAgo),
        ),
      );
    if (Number(recent[0]?.count || 0) >= 5) {
      res.status(429).json({ error: "Too many messages. Please try again later." });
      return;
    }

    const [submission] = await db
      .insert(contactSubmissions)
      .values({
        profileId: profile.id,
        userId: owner.id,
        handle,
        senderName: name,
        senderEmail: email,
        senderPhone: phone || null,
        message,
        deliveryStatus: "pending",
        ipHash,
      })
      .returning();

    await enqueueEmail({
      eventType: "contact",
      recipient: ownerEmail,
      subject: `New enquiry from ${name}`,
      dedupeKey: `contact:${submission.id}`,
      userId: owner.id,
      relatedId: submission.id,
      payload: {
        userName: owner.name || "there",
        senderName: name,
        senderEmail: email,
        senderPhone: phone,
        message,
        handle,
      },
    });

    res.json({ success: true, message: "Message received.", id: submission.id });
  } catch (err) {
    logger.error({ err, handle }, "Error submitting contact form");
    res.status(500).json({ error: "Unable to send your message right now." });
  }
});

// Short-lived cache for public profiles: these pages are read-heavy and
// tolerate ~30s of staleness, while each build costs several DB round trips.
const publicProfileCache = new Map<string, { expires: number; payload: unknown }>();
const PUBLIC_PROFILE_CACHE_TTL_MS = 30_000;

// GET /profile/public/:handle
router.get("/public/:handle", async (req, res): Promise<void> => {
  const { handle } = req.params;
  try {
    // Landing template iframes fetch this endpoint — serve fictional demo, never a real user.
    if (isMarketingDemoHandle(handle)) {
      const payload = getMarketingDemoProfile();
      res.setHeader("X-Cache", "DEMO");
      res.setHeader("Cache-Control", "public, max-age=60");
      res.json(payload);
      return;
    }

    const cached = publicProfileCache.get(handle);
    if (cached && cached.expires > Date.now()) {
      res.setHeader("X-Cache", "HIT");
      res.json(cached.payload);
      return;
    }

    const profileList = await db.select().from(profiles).where(eq(profiles.handle, handle)).limit(1);
    const profile = profileList[0];
    if (!profile) {
      res.status(404).json({ error: "Portfolio not found" });
      return;
    }

    // Independent lookups — run them in parallel to cut latency
    const [userList, sections, subscriptionState, siteAccess] = await Promise.all([
      db.select().from(users).where(eq(users.id, profile.userId)).limit(1),
      db.select().from(profileSections).where(eq(profileSections.profileId, profile.id)),
      resolveSubscriptionState(profile.userId),
      resolveSiteAccess(profile.userId),
    ]);
    const user = userList[0];
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    // Incomplete onboarding must not be publicly crawlable / shareable.
    if (!user.onboardingCompletedAt) {
      res.status(404).json({ error: "Portfolio not found" });
      return;
    }

    if (siteAccess.isPausedForVisitors) {
      res.status(503).json({
        error: "Portfolio paused",
        paused: true,
        pauseReason: siteAccess.pauseReason,
        siteStatus: siteAccess.siteStatus,
        handle,
        name: user.name,
      });
      return;
    }

    const getEntries = (type: string) => sections.find(s => s.type === type)?.entries || [];
    const contactEntries = sections.find(s => s.type === "contact")?.entries as any;

    const isPremium = subscriptionState.isPremium;
    // Enforce tier design limits:
    // If not premium, override template to minimal. Custom theme color is allowed.
    const templateId = isPremium ? (user.templateId || "minimal") : "minimal";

    const payload = buildPublicProfile({
      profile,
      user: {
        ...user,
        templateId,
        themeColor: user.themeColor || "blue",
        themeBg: user.themeBg || "grid",
        openToHire: user.openToHire ?? false,
      },
      isPremium,
      aboutEntries: getEntries("about"),
      educationEntries: getEntries("education"),
      experienceEntries: getEntries("experience"),
      projectEntries: getEntries("projects"),
      certificateEntries: getEntries("certificates"),
      achievementEntries: getEntries("achievements"),
      researchEntries: getEntries("research"),
      skillEntries: getEntries("skills"),
      contactData: (contactEntries as Record<string, unknown>) || {
        email: user.email || "",
        linkedin: "",
        github: "",
        portfolio: "",
      },
    });

    publicProfileCache.set(handle, {
      expires: Date.now() + PUBLIC_PROFILE_CACHE_TTL_MS,
      payload,
    });
    res.setHeader("X-Cache", "MISS");
    res.json({ ...payload, profileId: profile.id });
  } catch (err) {
    logger.error({ err, handle }, "Error fetching public profile");
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * Regenerate the system ATS resume into users.generatedResumeUrl.
 * The old generated PDF is removed from R2. Generated resumes never count
 * against the user's storage quota. Returns the new URL, or null on failure.
 */
async function regenerateSystemResume(userId: string): Promise<string | null> {
  const userList = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const user = userList[0];
  if (!user) return null;

  const profileList = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1);
  const profile = profileList[0];
  if (!profile) return null;

  const sections = await db.select().from(profileSections).where(eq(profileSections.profileId, profile.id));
  const getEntries = (type: string) => (sections.find(s => s.type === type)?.entries || []) as any[];
  const contactEntries = sections.find(s => s.type === "contact")?.entries as any;

  const resumeBuffer = await generateATSResume({
    name: user.name || "Portfolio Owner",
    email: contactEntries?.email || user.email || undefined,
    phone: contactEntries?.phone || user.phone || undefined,
    linkedin: contactEntries?.linkedin || undefined,
    github: contactEntries?.github || undefined,
    headline: profile.headline || undefined,
    bio: profile.bio || undefined,
    photoUrl: user.photoUrl || undefined,
    aboutEntries: getEntries("about"),
    educationEntries: getEntries("education"),
    experienceEntries: getEntries("experience"),
    projectEntries: getEntries("projects"),
    certificateEntries: getEntries("certificates"),
    achievementEntries: getEntries("achievements"),
    researchEntries: getEntries("research"),
    skillEntries: getEntries("skills"),
  });

  const filename = `${user.name?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'portfolio'}_resume.pdf`;
  // Stable key: regenerating overwrites the same object, so previously shared
  // preview/download links keep working instead of 404ing after each update.
  // The ?v= suffix busts caches without changing the underlying object.
  const baseUrl = await uploadToR2(resumeBuffer, filename, "application/pdf", {
    key: `generated-resumes/${userId}.pdf`,
  });
  const generatedResumeUrl = `${baseUrl}?v=${Date.now()}`;

  const oldGenerated = user.generatedResumeUrl;
  await db.update(users).set({ generatedResumeUrl }).where(eq(users.id, userId));
  // Clean up only legacy random-key objects; stable-key versions share one object.
  if (oldGenerated && oldGenerated.split("?")[0] !== baseUrl) {
    await deleteFromR2(oldGenerated);
  }

  logger.info({ userId, generatedResumeUrl }, "Regenerated system ATS resume");
  return generatedResumeUrl;
}

// Keep the system resume in sync with profile edits.
async function autoGenerateResumeIfNeeded(userId: string): Promise<void> {
  try {
    await regenerateSystemResume(userId);
  } catch (err) {
    logger.error({ err, userId }, "Failed in autoGenerateResumeIfNeeded helper");
  }
}

// POST /profile/generate-resume
router.post("/generate-resume", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const userId = req.user!.id;
  try {
    const url = await regenerateSystemResume(userId);
    if (!url) {
      res.status(404).json({ error: "Profile not found" });
      return;
    }
    res.json({ success: true, url });
  } catch (err: any) {
    logger.error({ err, userId }, "Error compiling ATS PDF resume");
    res.status(500).json({ error: err.message || "Failed to generate professional resume PDF" });
  }
});

// ---------------------------------------------------------------------------
// Resume manager: store-only upload, remove, and default-resume preference
// ---------------------------------------------------------------------------

// POST /profile/resume-file — upload a resume without AI parsing (no parse quota)
router.post("/resume-file", requireAuth, upload.single("resume"), async (req: AuthenticatedRequest, res): Promise<void> => {
  const userId = req.user!.id;
  const file = req.file;

  if (!file) {
    res.status(400).json({ error: "No resume file uploaded" });
    return;
  }
  if (file.mimetype !== "application/pdf") {
    res.status(400).json({ error: "Only PDF files are supported" });
    return;
  }

  try {
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const subscriptionState = await resolveSubscriptionState(userId);
    const currentUsed = Number(user.storageUsedBytes) || 0;
    // Replacing an old upload frees its bytes first
    let reclaimable = 0;
    if (user.resumeUrl) {
      const [oldAsset] = await db
        .select({ sizeBytes: assets.sizeBytes })
        .from(assets)
        .where(and(eq(assets.userId, userId), eq(assets.url, user.resumeUrl)))
        .limit(1);
      reclaimable = Number(oldAsset?.sizeBytes) || 0;
    }
    if (user.onboardingCompletedAt && currentUsed - reclaimable + file.size > subscriptionState.storageQuotaBytes) {
      res.status(403).json({ error: "Storage limit exceeded. Free up space or upgrade your plan." });
      return;
    }

    const url = await replaceUploadedResume(userId, user, file);
    res.json({ success: true, url, defaultResume: "uploaded", sizeBytes: file.size });
  } catch (err: any) {
    logger.error({ err, userId }, "Error uploading resume file");
    res.status(500).json({ error: err.message || "Failed to upload resume" });
  }
});

// DELETE /profile/resume-file — remove the uploaded resume, fall back to generated
router.delete("/resume-file", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const userId = req.user!.id;
  try {
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    if (!user.resumeUrl) {
      res.status(404).json({ error: "No uploaded resume to remove." });
      return;
    }

    const oldUrl = user.resumeUrl;
    let reclaimedBytes = 0;
    const [oldAsset] = await db
      .select()
      .from(assets)
      .where(and(eq(assets.userId, userId), eq(assets.url, oldUrl)))
      .limit(1);
    if (oldAsset) {
      reclaimedBytes = Number(oldAsset.sizeBytes) || 0;
      await db.delete(assets).where(eq(assets.id, oldAsset.id));
    }
    await deleteFromR2(oldUrl);

    const newUsed = Math.max(0, (Number(user.storageUsedBytes) || 0) - reclaimedBytes);
    await db
      .update(users)
      .set({ resumeUrl: null, defaultResume: "generated", storageUsedBytes: newUsed })
      .where(eq(users.id, userId));

    // Public pages must reflect the change immediately
    const [profile] = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1);
    if (profile?.handle) { publicProfileCache.delete(profile.handle); invalidatePortfolioRenderCache(profile.handle); }

    res.json({
      success: true,
      defaultResume: "generated",
      generatedResumeUrl: user.generatedResumeUrl,
      storageUsedBytes: newUsed,
    });
  } catch (err: any) {
    logger.error({ err, userId }, "Error removing uploaded resume");
    res.status(500).json({ error: err.message || "Failed to remove resume" });
  }
});

// PATCH /profile/resume-preference — choose which resume backs the public download button
router.patch("/resume-preference", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const userId = req.user!.id;
  const preference = req.body?.defaultResume;

  if (preference !== "generated" && preference !== "uploaded") {
    res.status(400).json({ error: "defaultResume must be 'generated' or 'uploaded'." });
    return;
  }

  try {
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    if (preference === "uploaded" && !user.resumeUrl) {
      res.status(409).json({ error: "Upload a resume first to make it the default." });
      return;
    }
    if (preference === "generated" && !user.generatedResumeUrl) {
      // Generate one on the spot so the toggle always works
      const url = await regenerateSystemResume(userId);
      if (!url) {
        res.status(409).json({ error: "Could not generate a system resume yet. Add profile details first." });
        return;
      }
    }

    await db.update(users).set({ defaultResume: preference }).where(eq(users.id, userId));

    const [profile] = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1);
    if (profile?.handle) { publicProfileCache.delete(profile.handle); invalidatePortfolioRenderCache(profile.handle); }

    res.json({ success: true, defaultResume: preference });
  } catch (err: any) {
    logger.error({ err, userId }, "Error updating resume preference");
    res.status(500).json({ error: err.message || "Failed to update resume preference" });
  }
});

// ---------------------------------------------------------------------------
// Profile updates with hard monthly limits
// ---------------------------------------------------------------------------

const UPDATE_SECTION_MAP: Record<string, string> = {
  education: "education",
  experience: "experience",
  project: "projects",
  certificate: "certificates",
  achievement: "achievements",
  research: "research",
  skill: "skills",
};

// POST /profile/updates — append one entry to a section, consuming an update credit
router.post("/updates", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const userId = req.user!.id;
  const category = String(req.body?.category || "");
  const entry = req.body?.entry;
  const sectionType = UPDATE_SECTION_MAP[category];

  if (!sectionType || !entry || typeof entry !== "object") {
    res.status(400).json({ error: "Provide a valid category and entry." });
    return;
  }

  try {
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const subscriptionState = await resolveSubscriptionState(userId);
    const limits = await getPlanLimits(subscriptionState.isPremium ? subscriptionState.plan : "free");
    const usage = await getUpdatesUsage(user, limits.updatesPerMonth);

    if (usage.remaining <= 0) {
      res.status(429).json({
        error: `You have used all ${limits.updatesPerMonth} profile update(s) included in the ${limits.planDisplay} plan this month. Resets in ${usage.daysToReset} day(s).`,
        code: "UPDATE_LIMIT_REACHED",
        used: usage.used,
        limit: usage.limit,
        daysToReset: usage.daysToReset,
      });
      return;
    }

    const profile = await getOrCreateProfile(userId);
    const [section] = await db
      .select()
      .from(profileSections)
      .where(and(eq(profileSections.profileId, profile.id), eq(profileSections.type, sectionType)))
      .limit(1);

    const existingEntries = Array.isArray(section?.entries) ? (section!.entries as any[]) : [];
    if (sectionType === "skills" && existingEntries.length >= MAX_SKILLS) {
      res.status(400).json({ error: `You can save up to ${MAX_SKILLS} skills.`, code: "SKILLS_CAP" });
      return;
    }

    let newEntry: any = { ...entry, id: String(entry.id || Date.now()) };
    let newEntries: any[] | null = null;
    if (sectionType === "skills") {
      const skillCategory = entry?.category || "technical";
      const rawNames = String(entry?.name || "")
        .split(/[,;\n]+/)
        .map((n: string) => n.trim())
        .filter(Boolean);
      if (rawNames.length === 0) {
        res.status(400).json({ error: "Provide a skill name." });
        return;
      }
      const normalizedList = normalizeSkills(
        rawNames.map((name: string) => ({ name, category: skillCategory })),
      );
      if (normalizedList.length === 0) {
        res.status(400).json({ error: "Provide a skill name." });
        return;
      }
      const existingLower = new Set(
        existingEntries.map((e: any) => String(e.name || "").toLowerCase()),
      );
      const uniqueNew = normalizedList.filter(
        (s) => !existingLower.has(String(s.name || "").toLowerCase()),
      );
      if (uniqueNew.length === 0) {
        res.status(409).json({ error: "That skill is already on your profile.", code: "SKILL_DUPLICATE" });
        return;
      }
      if (existingEntries.length + uniqueNew.length > MAX_SKILLS) {
        res.status(400).json({
          error: `You can save up to ${MAX_SKILLS} skills.`,
          code: "SKILLS_CAP",
        });
        return;
      }
      newEntries = uniqueNew.map((s, i) => ({
        ...s,
        id: String(s.id || `${Date.now()}-${i}`),
      }));
      newEntry = newEntries[0];
    }
    const nextEntries = newEntries
      ? [...existingEntries, ...newEntries]
      : [...existingEntries, newEntry];
    if (sectionType === "skills" && nextEntries.length > MAX_SKILLS) {
      res.status(400).json({ error: `You can save up to ${MAX_SKILLS} skills.`, code: "SKILLS_CAP" });
      return;
    }

    const consumed = await consumeUpdate(userId, limits.updatesPerMonth);
    if (!consumed) {
      res.status(429).json({
        error: `You have used all ${limits.updatesPerMonth} profile update(s) included in the ${limits.planDisplay} plan this month.`,
        code: "UPDATE_LIMIT_REACHED",
        used: usage.limit,
        limit: usage.limit,
        daysToReset: usage.daysToReset,
      });
      return;
    }

    await db.insert(profileSections).values({
      profileId: profile.id,
      type: sectionType,
      entries: nextEntries,
      reviewedAt: new Date(),
    }).onConflictDoUpdate({
      target: [profileSections.profileId, profileSections.type],
      set: { entries: nextEntries, reviewedAt: new Date() },
    });

    await markOnboardingActivity(userId);

    // Keep the generated resume and public page in sync
    await autoGenerateResumeIfNeeded(userId);
    if (profile.handle) { publicProfileCache.delete(profile.handle); invalidatePortfolioRenderCache(profile.handle); }

    res.json({
      success: true,
      entry: newEntry,
      entries: newEntries || [newEntry],
      sectionType,
      usage: {
        used: usage.used + 1,
        limit: usage.limit,
        remaining: Math.max(0, usage.remaining - 1),
        daysToReset: usage.daysToReset,
      },
    });
  } catch (err: any) {
    logger.error({ err, userId, category }, "Error posting profile update");
    res.status(500).json({ error: err.message || "Failed to post update" });
  }
});

// GET /profile/updates/usage — remaining update credits for the dashboard
router.get("/updates/usage", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const userId = req.user!.id;
  try {
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    const subscriptionState = await resolveSubscriptionState(userId);
    const limits = await getPlanLimits(subscriptionState.isPremium ? subscriptionState.plan : "free");
    const usage = await getUpdatesUsage(user, limits.updatesPerMonth);
    res.json({ ...usage, plan: limits.planId, planDisplay: limits.planDisplay });
  } catch (err: any) {
    logger.error({ err, userId }, "Error reading updates usage");
    res.status(500).json({ error: "Failed to read update usage" });
  }
});

// ---------------------------------------------------------------------------
// Assets & storage manager
// ---------------------------------------------------------------------------

// GET /profile/assets — all tracked files + server-side usage meter
router.get("/assets", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const userId = req.user!.id;
  try {
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    const subscriptionState = await resolveSubscriptionState(userId);
    const rows = await db
      .select()
      .from(assets)
      .where(eq(assets.userId, userId))
      .orderBy(desc(assets.createdAt));

    res.json({
      assets: rows,
      storageUsedBytes: Number(user.storageUsedBytes) || 0,
      storageQuotaBytes: subscriptionState.storageQuotaBytes,
      addonBlocks: subscriptionState.addonBlocks,
      addonBytes: subscriptionState.addonBytes,
    });
  } catch (err: any) {
    logger.error({ err, userId }, "Error listing assets");
    res.status(500).json({ error: "Failed to load assets" });
  }
});

/** Remove an asset URL from any profile section entries that reference it. */
async function detachAssetFromSections(userId: string, url: string): Promise<void> {
  const [profile] = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1);
  if (!profile) return;
  const sections = await db.select().from(profileSections).where(eq(profileSections.profileId, profile.id));

  for (const section of sections) {
    if (!Array.isArray(section.entries)) continue;
    let changed = false;
    const nextEntries = (section.entries as any[]).map((entry) => {
      if (!entry || typeof entry !== "object" || !entry.assets || typeof entry.assets !== "object") return entry;
      const filterList = (list: unknown) =>
        Array.isArray(list) ? list.filter((item: any) => item?.url !== url) : list;
      const images = filterList(entry.assets.images);
      const pdfs = filterList(entry.assets.pdfs);
      if (
        (Array.isArray(entry.assets.images) && (images as any[]).length !== entry.assets.images.length) ||
        (Array.isArray(entry.assets.pdfs) && (pdfs as any[]).length !== entry.assets.pdfs.length)
      ) {
        changed = true;
        return { ...entry, assets: { ...entry.assets, images, pdfs } };
      }
      return entry;
    });
    if (changed) {
      await db
        .update(profileSections)
        .set({ entries: nextEntries, reviewedAt: new Date() })
        .where(eq(profileSections.id, section.id));
    }
  }

  if (profile.handle) { publicProfileCache.delete(profile.handle); invalidatePortfolioRenderCache(profile.handle); }
}

// DELETE /profile/assets/:id — remove from R2, reclaim quota, detach from sections
router.delete("/assets/:id", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const userId = req.user!.id;
  const assetId = String(req.params.id || "");
  try {
    const [asset] = await db
      .select()
      .from(assets)
      .where(and(eq(assets.id, assetId), eq(assets.userId, userId)))
      .limit(1);
    if (!asset) {
      res.status(404).json({ error: "Asset not found" });
      return;
    }

    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);

    await db.delete(assets).where(eq(assets.id, asset.id));
    await deleteFromR2(asset.url);
    await detachAssetFromSections(userId, asset.url);

    // Uploaded resume deleted through the assets page must also clear the slot
    if (user?.resumeUrl === asset.url) {
      await db
        .update(users)
        .set({ resumeUrl: null, defaultResume: "generated" })
        .where(eq(users.id, userId));
    }

    const newUsed = Math.max(0, (Number(user?.storageUsedBytes) || 0) - (Number(asset.sizeBytes) || 0));
    await db.update(users).set({ storageUsedBytes: newUsed }).where(eq(users.id, userId));

    res.json({ success: true, storageUsedBytes: newUsed, reclaimedBytes: Number(asset.sizeBytes) || 0 });
  } catch (err: any) {
    logger.error({ err, userId, assetId }, "Error deleting asset");
    res.status(500).json({ error: "Failed to delete asset" });
  }
});

export default router;
