/**
 * Proves the DEPLOYED Cloud Run instance can drain the queue with its own env.
 * Enqueues a job for a throwaway user, calls the live worker route, checks the
 * result, then removes everything it created.
 *
 *   API_URL=... CRON_SECRET=... node --import tsx scripts/verify-live-parse.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../../..");
for (const line of fs.readFileSync(path.join(rootDir, ".env"), "utf-8").split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i <= 0) continue;
  let v = t.slice(i + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  if (!process.env[t.slice(0, i).trim()]) process.env[t.slice(0, i).trim()] = v;
}

const API_URL = process.env.API_URL;
const CRON = process.env.CRON_SECRET;
if (!API_URL || !CRON) {
  console.error("Set API_URL and CRON_SECRET.");
  process.exit(1);
}

const { db, users, profiles, profileSections, resumeParseAttempts } = await import("@workspace/db");
const { eq } = await import("drizzle-orm");

const SAMPLE = `Meera Iyer
Chennai, India | meera.live.qa@example.com | +91 90000 11111

EDUCATION
Anna University - B.Tech Information Technology, 2021 - 2025, CGPA 9.1

EXPERIENCE
Data Analyst Intern, Freshworks, Jan 2025 - Present
- Automated weekly churn reporting, saving 6 analyst hours per week

PROJECTS
RailPredict - Train delay forecasting with gradient boosting. Python, scikit-learn, Streamlit.

SKILLS
Python, SQL, Pandas, scikit-learn, Tableau, Git`;

let userId = null;
let attemptId = null;

try {
  const [user] = await db
    .insert(users)
    .values({ phone: `+9198${String(Date.now()).slice(-8)}`, name: "Live QA" })
    .returning();
  userId = user.id;

  const [attempt] = await db
    .insert(resumeParseAttempts)
    .values({
      userId,
      status: "queued",
      fileHash: `live-qa-${Date.now()}`,
      fileName: "live-qa.pdf",
      fileSizeBytes: 2048,
      duringOnboarding: true,
      resumeText: SAMPLE,
    })
    .returning();
  attemptId = attempt.id;
  console.log(`Queued attempt ${attemptId} for throwaway user ${userId}`);

  const started = Date.now();
  const res = await fetch(`${API_URL}/api/profile/jobs/resume-parse-worker`, {
    method: "POST",
    headers: { "x-cron-secret": CRON },
  });
  console.log(`Live worker responded ${res.status}: ${await res.text()}  (${Date.now() - started}ms)`);

  // The in-process ticker may also pick it up; poll briefly either way.
  let final = null;
  for (let i = 0; i < 45; i += 1) {
    const [row] = await db.select().from(resumeParseAttempts).where(eq(resumeParseAttempts.id, attemptId));
    if (row.status === "succeeded" || row.status === "failed") {
      final = row;
      break;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }

  if (!final) {
    console.log("RESULT: still pending after 90s — check Cloud Run logs.");
  } else if (final.status === "succeeded") {
    console.log(`RESULT: succeeded via ${final.model}`);
    console.log("  name:", final.result?.name);
    console.log("  skills:", final.result?.skills?.length);
    console.log("  bio:", String(final.result?.bio || "").slice(0, 240));
  } else {
    console.log(`RESULT: failed  code=${final.errorCode}  message=${final.errorMessage}`);
  }
} finally {
  if (userId) {
    const [profile] = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1);
    if (profile) {
      await db.delete(profileSections).where(eq(profileSections.profileId, profile.id));
      await db.delete(profiles).where(eq(profiles.id, profile.id));
    }
    await db.delete(resumeParseAttempts).where(eq(resumeParseAttempts.userId, userId));
    await db.delete(users).where(eq(users.id, userId));
    console.log("Cleaned up throwaway user.");
  }
}

process.exit(0);
