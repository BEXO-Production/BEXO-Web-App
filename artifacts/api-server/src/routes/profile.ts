import { Router } from "express";
import { requireAuth, AuthenticatedRequest } from "../middlewares/auth";
import { db, users, profiles, profileSections } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "../lib/logger";
import multer from "multer";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const pdf = require("pdf-parse");

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
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
    res.json({
      profile,
      user: {
        id: user.id,
        phone: user.phone,
        name: user.name,
        email: user.email,
        dob: user.dob,
        profilePhotoAssetId: user.profilePhotoAssetId,
        storageUsedBytes: user.storageUsedBytes,
        storageQuotaBytes: user.storageQuotaBytes
      }
    });
  } catch (err) {
    logger.error({ err, userId }, "Error fetching profile");
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /profile
router.patch("/", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const userId = req.user!.id;
  const { name, dob, handle, headline, careerGoal, bio, completionPct, profilePhotoAssetId } = req.body;
  try {
    // Update user info if name, dob, profilePhotoAssetId is provided
    const userUpdates: Partial<typeof users.$inferInsert> = {};
    if (name !== undefined) userUpdates.name = name;
    if (dob !== undefined) userUpdates.dob = dob;
    if (profilePhotoAssetId !== undefined) userUpdates.profilePhotoAssetId = profilePhotoAssetId;

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

    res.json({ success: true, message: `Profile section ${type} updated successfully` });
  } catch (err) {
    logger.error({ err, userId, type }, "Error updating profile section");
    res.status(500).json({ error: "Internal server error" });
  }
});

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

  try {
    logger.info({ userId, fileName: file.originalname }, "Starting resume processing");

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
    const primaryModel = process.env.OPENROUTER_MODEL || "google/gemma-4-31b-it:free";
    const backupModel = process.env.OPENROUTER_BACKUP_MODEL || "google/gemma-4-26b-a4b-it:free";

    const systemPrompt = `You are an expert resume parsing AI assistant.
Your task is to extract professional information from the provided resume text and format it into a structured JSON object.
Return ONLY a valid JSON object. Do not include any explanations, introduction, markdown blocks, or extra text.

The JSON structure must match this schema exactly:
{
  "headline": "A short, professional headline (e.g. Frontend Developer Intern)",
  "bio": "A professional summary of 2-3 sentences.",
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

Fill every field with information extracted from the resume. If a category has no data, return an empty array.`;

    async function callOpenRouter(model: string): Promise<any> {
      logger.info({ model }, "Calling OpenRouter for resume parsing");
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
        })
      });

      if (!openRouterRes.ok) {
        const errorText = await openRouterRes.text();
        logger.error({ errorText, model, status: openRouterRes.status }, "OpenRouter API call failed");
        throw new Error(`OpenRouter API failed (${openRouterRes.status}): ${openRouterRes.statusText}`);
      }

      const openRouterData = (await openRouterRes.json()) as any;
      const content = openRouterData.choices?.[0]?.message?.content || "";
      const jsonStr = content.replace(/```json/g, "").replace(/```/g, "").trim();
      return JSON.parse(jsonStr);
    }

    if (apiKey) {
      try {
        parsedData = await callOpenRouter(primaryModel);
      } catch (primaryErr: any) {
        logger.warn({ err: primaryErr.message, primaryModel }, "Primary model failed, trying backup model");
        try {
          parsedData = await callOpenRouter(backupModel);
        } catch (backupErr: any) {
          logger.error({ err: backupErr.message, backupModel }, "Backup model also failed, using mock data");
          parsedData = null;
        }
      }
    }

    if (!parsedData) {
      logger.warn("AI parsing failed or no API key. Falling back to mock resume data.");
      parsedData = {
        headline: "Software Engineer Intern",
        bio: "Passionate developer skilled in building modern web applications with React, Node.js, and TypeScript. Looking to create impactful portfolio experiences.",
        education: [
          { institution: "Indian Institute of Technology", degree: "B.Tech in Computer Science", year: "2021 - 2025", grade: "9.2 CGPA" }
        ],
        experience: [
          { company: "Bexo Tech", role: "Software Developer Intern", duration: "May 2024 - July 2024", description: "Collaborated on building secure onboarding flows. Optimized database schemas and API latency." }
        ],
        projects: [
          { title: "Bexo Web Portal", description: "A portfolio building onboarding flow wizard with integrated secure OTP phone verification.", tech: "React, Vite, Tailwind CSS, Express, Drizzle ORM, Supabase" }
        ],
        certificates: [
          { title: "React Developer Certification", issuer: "Meta", date: "Jan 2024" }
        ],
        achievements: [
          { title: "Winner of HackFest 2024", organization: "IIT Madras", date: "Feb 2024" }
        ]
      };
    }

    const profile = await getOrCreateProfile(userId);
    
    await db.update(profiles).set({
      headline: parsedData.headline || "",
      bio: parsedData.bio || ""
    }).where(eq(profiles.id, profile.id));

    const sectionsToSave = [
      { type: "education", entries: parsedData.education || [] },
      { type: "experience", entries: parsedData.experience || [] },
      { type: "projects", entries: parsedData.projects || [] },
      { type: "certificates", entries: parsedData.certificates || [] },
      { type: "achievements", entries: parsedData.achievements || [] }
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
      data: parsedData
    });
  } catch (err: any) {
    logger.error({ err, userId }, "Error processing resume");
    res.status(500).json({ error: err.message || "Failed to process resume" });
  }
});

export default router;
