/**
 * Async resume parse queue.
 *
 * Upload requests only enqueue a row; this module drains the queue in the
 * background. Two limits keep a spike of uploads from melting AI quotas or the
 * container: a per-instance worker pool and a cross-instance Redis semaphore.
 * Everything degrades safely — no Redis just means per-instance limits apply.
 */
import Redis from "ioredis";
import { and, desc, eq, lt, sql } from "drizzle-orm";
import {
  db,
  users,
  profiles,
  profileSections,
  resumeParseAttempts,
} from "@workspace/db";
import { logger } from "./logger";
import { getOrCreateProfile } from "./profileStore";
import { normalizeSkills, MAX_SKILLS } from "./publicProfile";
import {
  executeResilientResumeParsing,
  synthesizeProfileSummary,
  type ParsedResumeData,
} from "./aiResilienceEngine";

/** Max parses this container will run at once. */
const LOCAL_CONCURRENCY = Number(process.env.RESUME_PARSE_LOCAL_CONCURRENCY || 4);
/** Max parses across every container (Redis-backed). */
const GLOBAL_CONCURRENCY = Number(process.env.RESUME_PARSE_GLOBAL_CONCURRENCY || 60);
/** A claimed job older than this is considered orphaned (container died mid-parse). */
const STALE_CLAIM_MS = Number(process.env.RESUME_PARSE_STALE_MS || 5 * 60 * 1000);
/** How long a user must wait after a total provider outage. */
export const PARSE_COOLDOWN_MS = Number(process.env.RESUME_PARSE_COOLDOWN_MS || 10 * 60 * 1000);
/** Transient failures get one more pass before the user is told to retry. */
const MAX_RETRIES = Number(process.env.RESUME_PARSE_MAX_RETRIES || 1);

const SEMAPHORE_KEY = "bexo:resume-parse:inflight";
/** Safety TTL so a crashed container cannot leak semaphore slots forever. */
const SEMAPHORE_TTL_SEC = Math.ceil(STALE_CLAIM_MS / 1000);

export const PARSE_BUSY_MESSAGE =
  "We could not finish reading your resume right now. Please try again in about 10 minutes — your file is safe and nothing was lost.";

let redis: Redis | null = null;
let redisDisabled = false;

function getRedis(): Redis | null {
  if (redisDisabled) return null;
  const url = process.env.REDIS_URL;
  if (!url) return null;
  if (redis) return redis;
  try {
    redis = new Redis(url, { maxRetriesPerRequest: 1, enableReadyCheck: true, lazyConnect: false });
    redis.on("error", (err) => {
      logger.warn({ err: err?.message || err }, "resumeParseQueue Redis error");
    });
    return redis;
  } catch (err: any) {
    redisDisabled = true;
    logger.warn({ err: err?.message || err }, "resumeParseQueue Redis unavailable; using per-instance limits only");
    return null;
  }
}

/** Cross-instance slot. Returns false when the global cap is already reached. */
async function acquireGlobalSlot(): Promise<boolean> {
  const client = getRedis();
  if (!client) return true;
  try {
    const inflight = await client.incr(SEMAPHORE_KEY);
    // Refresh the guard TTL on every acquire so a live queue never expires mid-flight.
    await client.expire(SEMAPHORE_KEY, SEMAPHORE_TTL_SEC);
    if (inflight > GLOBAL_CONCURRENCY) {
      await client.decr(SEMAPHORE_KEY);
      return false;
    }
    return true;
  } catch (err: any) {
    logger.warn({ err: err?.message || err }, "resumeParseQueue semaphore acquire failed; proceeding without it");
    return true;
  }
}

async function releaseGlobalSlot(): Promise<void> {
  const client = getRedis();
  if (!client) return;
  try {
    const remaining = await client.decr(SEMAPHORE_KEY);
    if (remaining < 0) await client.set(SEMAPHORE_KEY, 0);
  } catch (err: any) {
    logger.warn({ err: err?.message || err }, "resumeParseQueue semaphore release failed");
  }
}

/** Shape the AI output into the exact structure the portfolio sections expect. */
export function normalizeParsedData(raw: any): any {
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
      url: typeof url === "string" ? url : "",
    }));
  }

  if (Array.isArray(data.education)) {
    res.education = data.education.filter((edu: any) => edu && typeof edu === "object");
  } else if (data.education && typeof data.education === "object") {
    res.education = [data.education];
  }

  if (Array.isArray(data.experience)) {
    res.experience = data.experience.filter((exp: any) => exp && typeof exp === "object");
  } else if (data.experience && typeof data.experience === "object") {
    res.experience = [data.experience];
  }

  if (Array.isArray(data.projects)) {
    res.projects = data.projects.filter((proj: any) => proj && typeof proj === "object");
  } else if (data.projects && typeof data.projects === "object") {
    res.projects = [data.projects];
  }

  if (Array.isArray(data.certificates)) {
    res.certificates = data.certificates.filter((cert: any) => cert && typeof cert === "object");
  } else if (data.certificates && typeof data.certificates === "object") {
    res.certificates = [data.certificates];
  }

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

function splitRange(value: string): { startYear: string; endYear: string } {
  const raw = value || "";
  if (raw.includes("-")) {
    const parts = raw.split("-");
    return { startYear: parts[0]?.trim() || "", endYear: parts[1]?.trim() || "" };
  }
  return { startYear: "", endYear: raw };
}

/** Persist a completed parse onto the user's profile sections. */
async function applyParsedResume(userId: string, parsedData: any): Promise<void> {
  const profile = await getOrCreateProfile(userId);

  if (parsedData.name) {
    try {
      await db.update(users).set({
        name: parsedData.name,
        email: parsedData.email || undefined,
      }).where(eq(users.id, userId));
    } catch (dbErr: any) {
      logger.warn({ err: dbErr.message, userId }, "Failed to update user name/email, trying name only");
      try {
        await db.update(users).set({ name: parsedData.name }).where(eq(users.id, userId));
      } catch (nameErr: any) {
        logger.error({ err: nameErr.message, userId }, "Failed to update name only");
      }
    }
  }

  await db.update(profiles).set({
    headline: parsedData.headline || "",
    bio: parsedData.bio || "",
  }).where(eq(profiles.id, profile.id));

  const contactLinks = parsedData.links || [];
  const linkedin = contactLinks.find((l: any) => l.name?.toLowerCase().includes("linkedin"))?.url || "";
  const github = contactLinks.find((l: any) => l.name?.toLowerCase().includes("github"))?.url || "";
  const portfolio = contactLinks.find(
    (l: any) => !l.name?.toLowerCase().includes("linkedin") && !l.name?.toLowerCase().includes("github"),
  )?.url || "";

  const contactData = {
    email: parsedData.email || "",
    phone: parsedData.phone || "",
    linkedin,
    github,
    portfolio,
    customLinks: contactLinks,
  };

  const defaultAssets = { mode: "images", images: [], pdfs: [], links: [] };

  const latestEdu = parsedData.education?.length
    ? `${parsedData.education[0].degree} at ${parsedData.education[0].institution}`
    : "";
  const latestExp = parsedData.experience?.length
    ? `${parsedData.experience[0].role} at ${parsedData.experience[0].company}`
    : "";
  const currentStatus = latestExp || latestEdu || "";

  const sectionsToSave = [
    {
      type: "about",
      entries: [{
        id: "1",
        title: parsedData.headline || "Software Engineer Intern",
        description: parsedData.bio || "",
        currentStatus,
      }],
    },
    {
      type: "education",
      entries: (parsedData.education || []).map((edu: any, idx: number) => {
        const { startYear, endYear } = splitRange(edu.year || "");
        return {
          id: edu.id || String(idx + 1),
          institution: edu.institution || "",
          degree: edu.degree || "",
          startYear,
          endYear,
          year: edu.year || "",
          grade: edu.grade || "",
        };
      }),
    },
    {
      type: "experience",
      entries: (parsedData.experience || []).map((exp: any, idx: number) => {
        const { startYear, endYear } = splitRange(exp.duration || "");
        return {
          id: exp.id || String(idx + 1),
          company: exp.company || "",
          role: exp.role || "",
          startYear,
          endYear,
          duration: exp.duration || "",
          description: exp.description || "",
        };
      }),
    },
    {
      type: "projects",
      entries: (parsedData.projects || []).map((proj: any, idx: number) => ({
        id: proj.id || String(idx + 1),
        title: proj.title || "",
        description: proj.description || "",
        tech: proj.tech || "",
        link: proj.link || "",
        assets: proj.assets || defaultAssets,
      })),
    },
    {
      type: "certificates",
      entries: (parsedData.certificates || []).map((cert: any, idx: number) => ({
        id: cert.id || String(idx + 1),
        title: cert.title || "",
        issuer: cert.issuer || "",
        date: cert.date || "",
        assets: cert.assets || defaultAssets,
      })),
    },
    {
      type: "achievements",
      entries: (parsedData.achievements || []).map((ach: any, idx: number) => ({
        id: ach.id || String(idx + 1),
        title: ach.title || "",
        organization: ach.organization || "",
        date: ach.date || "",
        assets: ach.assets || defaultAssets,
      })),
    },
    {
      type: "skills",
      entries: normalizeSkills(parsedData.skills || []).slice(0, MAX_SKILLS),
    },
    { type: "contact", entries: contactData },
  ];

  const existingSections = await db
    .select()
    .from(profileSections)
    .where(eq(profileSections.profileId, profile.id));

  for (const sec of sectionsToSave) {
    const existingSec = existingSections.find((s) => s.type === sec.type);
    let mergedEntries: any = sec.entries;

    if (existingSec && Array.isArray(existingSec.entries)) {
      const existingEntries = existingSec.entries;

      if (sec.type === "about") {
        const existingAbout = (existingEntries[0] || {}) as any;
        const newAbout = (sec.entries[0] || {}) as any;
        mergedEntries = [{
          id: "1",
          title: existingAbout.title || newAbout.title || "",
          description: existingAbout.description || newAbout.description || "",
          currentStatus: existingAbout.currentStatus || newAbout.currentStatus || "",
        }];
      } else if (sec.type === "contact") {
        const existingContact = existingEntries as any;
        const newContact = sec.entries as any;
        mergedEntries = {
          email: existingContact.email || newContact.email || "",
          phone: existingContact.phone || newContact.phone || "",
          linkedin: existingContact.linkedin || newContact.linkedin || "",
          github: existingContact.github || newContact.github || "",
          portfolio: existingContact.portfolio || newContact.portfolio || "",
          customLinks: Array.isArray(newContact.customLinks)
            ? newContact.customLinks
            : (Array.isArray(existingContact.customLinks) ? existingContact.customLinks : []),
        };
      } else {
        // List sections are replaced wholesale by the freshly parsed resume.
        let nextIdIdx = 1;
        mergedEntries = (sec.entries || []).map((item: any) => ({ ...item, id: String(nextIdIdx++) }));
      }
    }

    await db.insert(profileSections).values({
      profileId: profile.id,
      type: sec.type,
      entries: mergedEntries,
      reviewedAt: new Date(),
    }).onConflictDoUpdate({
      target: [profileSections.profileId, profileSections.type],
      set: { entries: mergedEntries, reviewedAt: new Date() },
    });
  }
}

type QueuedAttempt = typeof resumeParseAttempts.$inferSelect;

/**
 * Claim the oldest queued job. SKIP LOCKED lets many workers (and many Cloud Run
 * instances) drain the same queue without handing one job to two workers.
 */
async function claimNextAttempt(): Promise<QueuedAttempt | null> {
  const claimed = await db.execute(sql`
    UPDATE resume_parse_attempts
    SET status = 'processing', claimed_at = now()
    WHERE id = (
      SELECT id FROM resume_parse_attempts
      WHERE status = 'queued'
      ORDER BY created_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING *
  `);

  const row = (claimed as any)?.rows?.[0] ?? (Array.isArray(claimed) ? (claimed as any)[0] : undefined);
  if (!row) return null;

  return {
    id: row.id,
    userId: row.user_id,
    status: row.status,
    fileHash: row.file_hash,
    fileName: row.file_name,
    fileSizeBytes: row.file_size_bytes,
    model: row.model,
    errorMessage: row.error_message,
    errorCode: row.error_code,
    resumeText: row.resume_text,
    resumeUrl: row.resume_url,
    result: row.result,
    claimedAt: row.claimed_at,
    retryCount: Number(row.retry_count || 0),
    consumedQuota: row.consumed_quota,
    duringOnboarding: row.during_onboarding,
    ipHash: row.ip_hash,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  } as QueuedAttempt;
}

/** Return orphaned jobs (worker died mid-parse) to the queue. */
export async function reclaimStaleAttempts(): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_CLAIM_MS);
  const reclaimed = await db
    .update(resumeParseAttempts)
    .set({ status: "queued", claimedAt: null, retryCount: sql`${resumeParseAttempts.retryCount} + 1` })
    .where(
      and(
        eq(resumeParseAttempts.status, "processing"),
        lt(resumeParseAttempts.claimedAt, cutoff),
        lt(resumeParseAttempts.retryCount, MAX_RETRIES),
      ),
    )
    .returning({ id: resumeParseAttempts.id });

  // Anything past the retry ceiling is a hard failure. It shares the outage code
  // so the same 10-minute cooldown applies as when every provider rejected us.
  const abandoned = await db
    .update(resumeParseAttempts)
    .set({
      status: "failed",
      errorCode: "provider_outage",
      errorMessage: "Parse worker did not finish in time",
      completedAt: new Date(),
      resumeText: null,
    })
    .where(
      and(
        eq(resumeParseAttempts.status, "processing"),
        lt(resumeParseAttempts.claimedAt, cutoff),
      ),
    )
    .returning({ id: resumeParseAttempts.id });

  const total = reclaimed.length + abandoned.length;
  if (total > 0) logger.warn({ reclaimed: reclaimed.length, abandoned: abandoned.length }, "Reclaimed stale resume parse jobs");
  return total;
}

async function failAttempt(attempt: QueuedAttempt, errorCode: string, errorMessage: string): Promise<void> {
  const canRetry = errorCode === "provider_outage" && Number(attempt.retryCount || 0) < MAX_RETRIES;

  if (canRetry) {
    await db
      .update(resumeParseAttempts)
      .set({ status: "queued", claimedAt: null, retryCount: Number(attempt.retryCount || 0) + 1 })
      .where(eq(resumeParseAttempts.id, attempt.id));
    return;
  }

  await db
    .update(resumeParseAttempts)
    .set({
      status: "failed",
      errorCode,
      errorMessage,
      completedAt: new Date(),
      // Drop the cached text once the job is terminal; it is no longer needed.
      resumeText: null,
    })
    .where(eq(resumeParseAttempts.id, attempt.id));
}

/** Run one claimed job end-to-end. Never throws. */
async function processAttempt(attempt: QueuedAttempt): Promise<void> {
  const userId = attempt.userId;
  const resumeText = attempt.resumeText || "";

  try {
    if (!resumeText.trim()) {
      await failAttempt(attempt, "no_text", "Resume text was empty");
      return;
    }

    const parseResult = await executeResilientResumeParsing(resumeText);
    if (!parseResult) {
      await failAttempt(attempt, "provider_outage", "All AI providers failed");
      return;
    }

    const parsedData = normalizeParsedData(parseResult.data);

    // Second pass: one grounded summary written from everything we extracted.
    const summary = await synthesizeProfileSummary(parsedData as ParsedResumeData);
    if (summary) parsedData.bio = summary;

    await applyParsedResume(userId, parsedData);

    // Only successful parses consume entitlement.
    if (attempt.duringOnboarding) {
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
        .set({ resumeParsesThisMonth: sql`coalesce(${users.resumeParsesThisMonth}, 0) + 1` })
        .where(eq(users.id, userId));
    }

    await db
      .update(resumeParseAttempts)
      .set({
        status: "succeeded",
        consumedQuota: true,
        completedAt: new Date(),
        model: parseResult.winningProvider,
        result: parsedData,
        resumeText: null,
        errorCode: null,
        errorMessage: null,
      })
      .where(eq(resumeParseAttempts.id, attempt.id));

    logger.info(
      { userId, attemptId: attempt.id, winningProvider: parseResult.winningProvider, summarized: Boolean(summary) },
      "Resume parse job completed",
    );
  } catch (err: any) {
    logger.error({ err: err?.message || err, userId, attemptId: attempt.id }, "Resume parse job failed");
    await failAttempt(attempt, "internal_error", err?.message || "Resume processing failed").catch(() => {});
  }
}

let activeWorkers = 0;
let drainScheduled = false;

/**
 * Drain the queue until it is empty or the global cap is saturated.
 * Safe to call concurrently — the pool size is enforced here.
 */
export async function drainResumeParseQueue(): Promise<void> {
  if (activeWorkers >= LOCAL_CONCURRENCY) return;

  activeWorkers += 1;
  try {
    for (;;) {
      const gotSlot = await acquireGlobalSlot();
      if (!gotSlot) {
        // Global cap hit: leave the rest queued for the next tick.
        return;
      }

      let attempt: QueuedAttempt | null = null;
      try {
        attempt = await claimNextAttempt();
      } catch (err: any) {
        logger.error({ err: err?.message || err }, "Failed to claim resume parse job");
      }

      if (!attempt) {
        await releaseGlobalSlot();
        return;
      }

      try {
        await processAttempt(attempt);
      } finally {
        await releaseGlobalSlot();
      }
    }
  } finally {
    activeWorkers -= 1;
  }
}

/**
 * Fire-and-forget nudge used right after an upload so a queued job starts
 * immediately instead of waiting for the next cron tick.
 */
export function kickResumeParseQueue(): void {
  if (drainScheduled) return;
  drainScheduled = true;
  setImmediate(() => {
    drainScheduled = false;
    void drainResumeParseQueue().catch((err) => {
      logger.error({ err: err?.message || err }, "Resume parse drain crashed");
    });
  });
}

/** Cron entry point: recover orphans, then drain whatever is pending. */
export async function runResumeParseWorkerTick(): Promise<{ reclaimed: number; pending: number }> {
  const reclaimed = await reclaimStaleAttempts();
  await drainResumeParseQueue();

  const [pendingRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(resumeParseAttempts)
    .where(eq(resumeParseAttempts.status, "queued"));

  return { reclaimed, pending: Number(pendingRow?.count || 0) };
}

/**
 * True when the user hit a total provider outage inside the cooldown window.
 * Returns the remaining wait in milliseconds.
 */
export async function getParseCooldownRemainingMs(userId: string): Promise<number> {
  const since = new Date(Date.now() - PARSE_COOLDOWN_MS);
  const [recent] = await db
    .select({ completedAt: resumeParseAttempts.completedAt, createdAt: resumeParseAttempts.createdAt })
    .from(resumeParseAttempts)
    .where(
      and(
        eq(resumeParseAttempts.userId, userId),
        eq(resumeParseAttempts.status, "failed"),
        eq(resumeParseAttempts.errorCode, "provider_outage"),
        sql`coalesce(${resumeParseAttempts.completedAt}, ${resumeParseAttempts.createdAt}) > ${since}`,
      ),
    )
    .orderBy(desc(resumeParseAttempts.createdAt))
    .limit(1);

  if (!recent) return 0;
  const failedAt = new Date(recent.completedAt || recent.createdAt || Date.now()).getTime();
  return Math.max(0, failedAt + PARSE_COOLDOWN_MS - Date.now());
}
