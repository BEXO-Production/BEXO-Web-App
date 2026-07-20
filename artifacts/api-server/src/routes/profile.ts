import { Router } from "express";
import crypto from "crypto";
import { requireAuth, AuthenticatedRequest } from "../middlewares/auth";
import {
  db,
  users,
  profiles,
  profileSections,
  payments,
  subscriptions,
  contactSubmissions,
  resumeParseAttempts,
} from "@workspace/db";
import { eq, and, desc, gt, sql } from "drizzle-orm";
import { logger } from "../lib/logger";
import { MARKETING_DEMO_HANDLE, getMarketingDemoProfile, isMarketingDemoHandle } from "../lib/marketingDemoProfile";
import multer from "multer";
import { createRequire } from "module";
import { uploadToR2 } from "../lib/r2";
import { generateATSResume } from "../lib/resumeEngine";
import { resolveSubscriptionState, syncStorageQuota } from "../lib/subscriptions";
import { buildPublicProfile } from "../lib/publicProfile";
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

// Helper to get or create profile
async function getOrCreateProfile(userId: string): Promise<typeof profiles.$inferSelect> {
  let profileList = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1);
  let profile = profileList[0];

  if (!profile) {
    const inserted = await db.insert(profiles).values({
      userId,
      headline: "",
      careerGoal: "",
      bio: "",
      completionPct: 0
    }).returning();
    profile = inserted[0];
    logger.info({ userId, profileId: profile.id }, "Created new empty profile");
  }
  return profile;
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

    const paymentsList = await db
      .select()
      .from(payments)
      .where(eq(payments.userId, userId))
      .orderBy(desc(payments.createdAt));

    res.json({
      profile,
      user: {
        id: user.id,
        phone: user.phone,
        name: user.name,
        email: user.email,
        dob: user.dob,
        photoUrl: user.photoUrl,
        resumeUrl: user.resumeUrl,
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
      aboutEntries: getEntries("about"),
      educationEntries: getEntries("education"),
      experienceEntries: getEntries("experience"),
      projectEntries: getEntries("projects"),
      certificateEntries: getEntries("certificates"),
      achievementEntries: getEntries("achievements"),
      researchEntries: getEntries("research"),
      contactData: contactEntries || { email: user.email || "", phone: user.phone || "", linkedin: "", github: "", portfolio: "" },
      payments: paymentsList
    });
  } catch (err) {
    logger.error({ err, userId }, "Error fetching profile");
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /profile
router.patch("/", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const userId = req.user!.id;
    const { 
      name, dob, email, photoUrl, resumeUrl, handle, headline, careerGoal, bio, completionPct, profilePhotoAssetId,
      openToHire, templateId, themeColor, themeBg,
      aboutEntries, educationEntries, experienceEntries, projectEntries, certificateEntries, achievementEntries, researchEntries, contactData
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
        userUpdates.email = email;
      }
      if (photoUrl !== undefined) userUpdates.photoUrl = photoUrl;
      if (resumeUrl !== undefined) userUpdates.resumeUrl = resumeUrl;
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
    const profileUpdates: Partial<typeof profiles.$inferInsert> = {};
    
    if (handle !== undefined && handle !== profile.handle) {
      const existing = await db.select().from(profiles).where(eq(profiles.handle, handle)).limit(1);
      if (existing.length > 0) {
        res.status(400).json({ error: "Handle is already taken" });
        return;
      }
      profileUpdates.handle = handle;
    }

    if (headline !== undefined) profileUpdates.headline = headline;
    if (careerGoal !== undefined) profileUpdates.careerGoal = careerGoal;
    if (bio !== undefined) profileUpdates.bio = bio;
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
      { type: "contact", entries: contactData }
    ];

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
    if (profile.handle) publicProfileCache.delete(profile.handle);

    res.json({ success: true, message: "Profile updated successfully" });
  } catch (err) {
    logger.error({ err, userId }, "Error updating profile");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /profile/check-handle
router.get("/check-handle", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
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
    const existing = await db.select().from(profiles).where(eq(profiles.handle, handle)).limit(1);
    const taken = existing.length > 0 && existing[0].userId !== req.user!.id;
    res.json({ available: !taken });
  } catch (err) {
    logger.error({ err, handle }, "Error checking handle availability");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /profile/suggest-handle
router.get("/suggest-handle", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
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

    // Find which of these are already in use by other users
    const matched = await db.select({ handle: profiles.handle, userId: profiles.userId })
      .from(profiles)
      .where(and(
        // Match any of the generated candidates
        // drizzle doesn't natively do SQL `IN` array matching cleanly without inArray helper,
        // so we query them all or filter
        eq(profiles.handle, candidates[0]) // fallback
      ));

    // To be perfectly safe, let's query all existing profiles matching our candidates
    const allMatches = await db.select().from(profiles);
    const takenHandles = new Set(
      allMatches
        .filter(p => p.userId !== req.user!.id) // owned by someone else
        .map(p => p.handle?.toLowerCase())
    );

    // Find the first candidate that isn't taken
    let suggestedHandle = candidates[0];
    for (const cand of candidates) {
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

    // Upsert section
    await db.insert(profileSections).values({
      profileId: profile.id,
      type,
      entries,
      reviewedAt: new Date()
    }).onConflictDoUpdate({
      target: [profileSections.profileId, profileSections.type],
      set: { entries, reviewedAt: new Date() }
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
    achievements: []
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

  let parsesCount = user.resumeParsesThisMonth || 0;
  let resetTime = user.lastResumeParseReset ? new Date(user.lastResumeParseReset) : new Date();
  const diffDays = Math.floor((now.getTime() - resetTime.getTime()) / (1000 * 60 * 60 * 24));
  let limitDays = 30;
  let limitParses = 2;
  let planDisplay = "Onboarding";

  if (duringOnboarding) {
    // Independent of payment: 2 successful parses during onboarding
    const onboardingUsed = user.onboardingSuccessfulParses || 0;
    if (!cached && onboardingUsed >= 2) {
      res.status(429).json({
        error: "You have used both successful onboarding resume parses. Continue with manual edits, or finish onboarding to unlock plan-based parsing.",
      });
      return;
    }
  } else {
    if (!plan || plan === "free") {
      limitDays = 30;
      limitParses = 2;
      planDisplay = "Free";
    } else if (plan === "lifetime") {
      limitDays = 30;
      limitParses = 3;
      planDisplay = "Lifetime";
    } else if (plan === "annual") {
      limitDays = 30;
      limitParses = 10;
      planDisplay = "Annual";
    }

    if (diffDays >= limitDays) {
      parsesCount = 0;
      resetTime = now;
      await db
        .update(users)
        .set({ resumeParsesThisMonth: 0, lastResumeParseReset: now })
        .where(eq(users.id, userId));
    }

    if (!cached && parsesCount >= limitParses) {
      const daysToReset = Math.max(limitDays - diffDays, 1);
      res.status(429).json({
        error: `You have reached your AI resume parsing limit of ${limitParses} successful parse(s) on the ${planDisplay} plan. Quota resets in ${daysToReset} days.`,
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
    if (currentUsed + file.size > quota) {
      await db
        .update(resumeParseAttempts)
        .set({ status: "failed", errorMessage: "Storage quota exceeded", completedAt: new Date() })
        .where(eq(resumeParseAttempts.id, attempt.id));
      res.status(403).json({ error: "Storage limit exceeded. Free up space or upgrade your plan." });
      return;
    }

    try {
      resumeUrl = await uploadToR2(file.buffer, file.originalname, file.mimetype);
      await db
        .update(users)
        .set({ resumeUrl, storageUsedBytes: currentUsed + file.size })
        .where(eq(users.id, userId));
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

    // 2. Parse text with Gemma via OpenRouter or Fallback
    let parsedData: any;
    const apiKey = process.env.OPENROUTER_API_KEY;
    
    const modelsToTry = [
      "openrouter/free",
      process.env.OPENROUTER_MODEL,
      "qwen/qwen-2.5-72b-instruct:free",
      "google/gemini-2.5-flash",
      process.env.OPENROUTER_BACKUP_MODEL
    ].filter(Boolean) as string[];

    const systemPrompt = `You are an expert resume parsing AI assistant.
    Your task is to extract professional information from the provided resume text and format it into a structured JSON object.
    Return ONLY a valid JSON object. Do not include any explanations, introduction, markdown blocks, or extra text.
    
    The JSON structure must match this schema exactly:
    {
      "name": "Candidate's full name",
      "headline": "A short, professional headline (e.g. Frontend Developer Intern)",
      "bio": "A professional summary or overview of 2-3 sentences.",
      "email": "Candidate's email address",
      "phone": "Candidate's phone number",
      "pronouns": "Candidate's pronouns, e.g. He/Him, She/Her, They/Them. If the candidate's pronouns are not explicitly mentioned in the resume text, intelligently deduce/determine the pronouns based on the candidate's first name (for example: Kavin or Kavinbalaji are male names, so pronouns should be He/Him). Default to He/Him if not clear.",
      "links": [
        { "name": "Name of the website/link (e.g. GitHub, LinkedIn, Personal Portfolio, Blog, Custom Project Link)", "url": "The full link URL" }
      ],
      "education": [
        { "institution": "Name of school/university", "degree": "Degree name", "year": "Graduation year or date range", "grade": "GPA, grade, or percentage (optional)" }
      ],
      "experience": [
        { "company": "Company name", "role": "Job title/role", "duration": "Duration (e.g. June 2024 - Present)", "description": "Bullet points of key accomplishments" }
      ],
      "projects": [
        { "title": "Project name", "description": "Brief description of the project", "tech": "Comma-separated list of technologies used" }
      ],
      "certificates": [
        { "title": "Certificate name", "issuer": "Issuing organization", "date": "Date issued" }
      ],
      "achievements": [
        { "title": "Achievement title", "organization": "Awarding organization", "date": "Date awarded" }
      ]
    }
    
    Fill every field with information extracted from the resume. If a category has no data, return an empty array or empty string. Extra links must be extracted with their names and full URLs.`;

    async function callOpenRouter(model: string): Promise<any> {
      logger.info({ model }, "Calling OpenRouter for resume parsing");
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 seconds timeout

      try {
        const openRouterRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`,
            "HTTP-Referer": "https://mybexo.com",
            "X-Title": "Bexo Onboarding"
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: resumeText }
            ],
            response_format: { type: "json_object" }
          }),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!openRouterRes.ok) {
          const errorText = await openRouterRes.text();
          logger.error({ errorText, model, status: openRouterRes.status }, "OpenRouter API call failed");
          throw new Error(`OpenRouter API failed (${openRouterRes.status}): ${openRouterRes.statusText}`);
        }

        const openRouterData = (await openRouterRes.json()) as any;
        const content = openRouterData.choices?.[0]?.message?.content || "";
        const firstBrace = content.indexOf("{");
        const lastBrace = content.lastIndexOf("}");
        if (firstBrace === -1 || lastBrace === -1) {
          throw new Error("No JSON object found in response");
        }
        const jsonStr = content.substring(firstBrace, lastBrace + 1);
        return JSON.parse(jsonStr);
      } catch (err: any) {
        clearTimeout(timeoutId);
        if (err.name === 'AbortError') {
          logger.error({ model }, "OpenRouter API call timed out after 15 seconds");
          throw new Error(`OpenRouter API call timed out for model ${model}`);
        }
        throw err;
      }
    }

    if (apiKey) {
      for (const model of modelsToTry) {
        try {
          const rawParsed = await callOpenRouter(model);
          if (rawParsed) {
            parsedData = normalizeParsedData(rawParsed);
            logger.info({ model }, "Successfully parsed resume using model");
            break;
          }
        } catch (err: any) {
          logger.warn({ err: err.message, model }, "Model failed for resume parsing, trying next model");
        }
      }
    }

    if (!parsedData) {
      logger.error({ userId }, "Resume parsing failed across all models");
      await db
        .update(resumeParseAttempts)
        .set({ status: "failed", errorMessage: "AI parsing failed", completedAt: new Date() })
        .where(eq(resumeParseAttempts.id, attempt.id));
      throw new Error("AI parsing failed. Please try again or fill details manually.");
    }

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
            customLinks: Array.isArray(existingContact.customLinks) ? existingContact.customLinks : (newContact.customLinks || [])
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
      if (currentUsed + file.size > quota) {
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
    const [userList, sections, subscriptionState] = await Promise.all([
      db.select().from(users).where(eq(users.id, profile.userId)).limit(1),
      db.select().from(profileSections).where(eq(profileSections.profileId, profile.id)),
      resolveSubscriptionState(profile.userId),
    ]);
    const user = userList[0];
    if (!user) {
      res.status(404).json({ error: "User not found" });
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
    res.json(payload);
  } catch (err) {
    logger.error({ err, handle }, "Error fetching public profile");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Helper to auto-generate resume PDF if user does not have a custom uploaded resume
async function autoGenerateResumeIfNeeded(userId: string): Promise<void> {
  try {
    const userList = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    const user = userList[0];
    if (!user) return;

    // Check if resumeUrl is empty OR is auto-generated (ends with _resume.pdf)
    const isAutoGenerated = !user.resumeUrl || user.resumeUrl.endsWith('_resume.pdf') || user.resumeUrl.includes('_resume.pdf');
    if (!isAutoGenerated) {
      return; // Do not overwrite custom uploaded resumes
    }

    const profileList = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1);
    const profile = profileList[0];
    if (!profile) return;

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
      researchEntries: getEntries("research")
    });

    const filename = `${user.name?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'portfolio'}_resume.pdf`;
    const resumeUrl = await uploadToR2(resumeBuffer, filename, "application/pdf");

    await db.update(users).set({ resumeUrl }).where(eq(users.id, userId));
    logger.info({ userId, resumeUrl }, "Successfully auto-generated and updated ATS resume");
  } catch (err) {
    logger.error({ err, userId }, "Failed in autoGenerateResumeIfNeeded helper");
  }
}

// POST /profile/generate-resume
router.post("/generate-resume", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const userId = req.user!.id;
  try {
    const userList = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    const user = userList[0];
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const profileList = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1);
    const profile = profileList[0];
    if (!profile) {
      res.status(404).json({ error: "Profile not found" });
      return;
    }

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
      researchEntries: getEntries("research")
    });

    const filename = `${user.name?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'portfolio'}_resume.pdf`;
    const resumeUrl = await uploadToR2(resumeBuffer, filename, "application/pdf");

    await db.update(users).set({ resumeUrl }).where(eq(users.id, userId));

    res.json({ success: true, url: resumeUrl });
  } catch (err: any) {
    logger.error({ err, userId }, "Error compiling ATS PDF resume");
    res.status(500).json({ error: err.message || "Failed to generate professional resume PDF" });
  }
});

export default router;
