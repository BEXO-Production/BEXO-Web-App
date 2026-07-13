import { Router } from "express";
import { requireAuth, AuthenticatedRequest } from "../middlewares/auth";
import { db, users, profiles, profileSections } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "../lib/logger";
import multer from "multer";
import { createRequire } from "module";
import { uploadToR2 } from "../lib/r2";
import { generateATSResume } from "../lib/resumeEngine";
import { resolveSubscriptionState, syncStorageQuota } from "../lib/subscriptions";

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
        openToHire: user.openToHire ?? false,
        templateId: user.templateId ?? 'minimal',
        themeColor: user.themeColor ?? 'blue'
      },
      plan: subscriptionState.plan,
      isPremium: subscriptionState.isPremium,
      aboutEntries: getEntries("about"),
      educationEntries: getEntries("education"),
      experienceEntries: getEntries("experience"),
      projectEntries: getEntries("projects"),
      certificateEntries: getEntries("certificates"),
      achievementEntries: getEntries("achievements"),
      researchEntries: getEntries("research"),
      contactData: contactEntries || { email: user.email || "", phone: user.phone || "", linkedin: "", github: "", portfolio: "" }
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
    name, dob, photoUrl, resumeUrl, handle, headline, careerGoal, bio, completionPct, profilePhotoAssetId,
    openToHire, templateId, themeColor,
    aboutEntries, educationEntries, experienceEntries, projectEntries, certificateEntries, achievementEntries, researchEntries, contactData
  } = req.body;
  try {
    // Resolve premium status for gating
    const subscriptionState = await resolveSubscriptionState(userId);
    const isPremium = subscriptionState.isPremium;

    // Gate template selection for free users
    if (templateId !== undefined && templateId !== 'minimal' && !isPremium) {
      res.status(403).json({ error: "Premium templates require a Pro subscription. Upgrade to unlock Academic and Creative layouts." });
      return;
    }

    // Update user info if name, dob, etc. is provided
    const userUpdates: Partial<typeof users.$inferInsert> = {};
    if (name !== undefined) userUpdates.name = name;
    if (dob !== undefined) userUpdates.dob = dob;
    if (photoUrl !== undefined) userUpdates.photoUrl = photoUrl;
    if (resumeUrl !== undefined) userUpdates.resumeUrl = resumeUrl;
    if (profilePhotoAssetId !== undefined) userUpdates.profilePhotoAssetId = profilePhotoAssetId;
    if (openToHire !== undefined) userUpdates.openToHire = !!openToHire;
    if (templateId !== undefined) userUpdates.templateId = templateId;
    if (themeColor !== undefined) userUpdates.themeColor = themeColor;

    if (Object.keys(userUpdates).length > 0) {
      await db.update(users).set(userUpdates).where(eq(users.id, userId));
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
    const existing = await db.select().from(profiles).where(eq(profiles.handle, handle)).limit(1);
    const taken = existing.length > 0 && existing[0].userId !== req.user!.id;
    res.json({ available: !taken });
  } catch (err) {
    logger.error({ err, handle }, "Error checking handle availability");
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

  // Upload resume to R2 inside a wrapper variable
  let resumeUrl = "";

  try {
    logger.info({ userId, fileName: file.originalname }, "Starting resume processing");

    try {
      resumeUrl = await uploadToR2(file.buffer, file.originalname, file.mimetype);
      await db.update(users).set({ resumeUrl }).where(eq(users.id, userId));
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

    for (const sec of sectionsToSave) {
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

    res.json({
      success: true,
      message: "Resume processed and profile updated successfully",
      data: parsedData,
      resumeUrl: resumeUrl || undefined
    });
  } catch (err: any) {
    logger.error({ err, userId }, "Error processing resume");
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

// GET /profile/public/:handle
router.get("/public/:handle", async (req, res): Promise<void> => {
  const { handle } = req.params;
  try {
    const profileList = await db.select().from(profiles).where(eq(profiles.handle, handle)).limit(1);
    const profile = profileList[0];
    if (!profile) {
      res.status(404).json({ error: "Portfolio not found" });
      return;
    }

    const userList = await db.select().from(users).where(eq(users.id, profile.userId)).limit(1);
    const user = userList[0];
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const sections = await db.select().from(profileSections).where(eq(profileSections.profileId, profile.id));
    const getEntries = (type: string) => sections.find(s => s.type === type)?.entries || [];
    const contactEntries = sections.find(s => s.type === "contact")?.entries as any;

    const subscriptionState = await resolveSubscriptionState(user.id);
    const isPremium = subscriptionState.isPremium;

    // Enforce tier design limits:
    // If not premium, override template and theme to minimal blue.
    const templateId = isPremium ? (user.templateId || 'minimal') : 'minimal';
    const themeColor = isPremium ? (user.themeColor || 'blue') : 'blue';

    res.json({
      profile: {
        ...profile,
      },
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        photoUrl: user.photoUrl,
        resumeUrl: user.resumeUrl,
        templateId,
        themeColor,
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
      contactData: contactEntries || { email: user.email || "", phone: user.phone || "", linkedin: "", github: "", portfolio: "" }
    });
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
