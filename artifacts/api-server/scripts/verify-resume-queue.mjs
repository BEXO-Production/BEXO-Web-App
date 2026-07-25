/**
 * End-to-end check of the async resume parse queue against the real database.
 * Creates a throwaway user, enqueues jobs, drains them with the real worker,
 * asserts the profile was written, then deletes everything it created.
 *
 *   node --import tsx scripts/verify-resume-queue.mjs
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
  process.env[t.slice(0, i).trim()] = v;
}

const { db, users, profiles, profileSections, resumeParseAttempts } = await import("@workspace/db");
const { eq, inArray } = await import("drizzle-orm");
const { runResumeParseWorkerTick, getParseCooldownRemainingMs } = await import("../src/lib/resumeParseQueue.ts");

const SAMPLE = `Aarav Sharma
Bengaluru, India | aarav.qa.bexo@example.com | +91 98765 43210
github.com/aaravsharma | linkedin.com/in/aaravsharma

EDUCATION
PSG College of Technology - B.E. Computer Science and Engineering, 2022 - 2026, CGPA 8.7

EXPERIENCE
Frontend Engineering Intern, Zoho Corporation, June 2025 - Present
- Built a React dashboard used by 400+ internal support agents

PROJECTS
CampusRide - Carpooling app for college students. Next.js, PostgreSQL, Mapbox.

CERTIFICATES
AWS Certified Cloud Practitioner - Amazon Web Services, 2025

ACHIEVEMENTS
Winner, Smart India Hackathon 2024 - Ministry of Education

SKILLS
JavaScript, TypeScript, React, Next.js, Node.js, Python, PostgreSQL, Docker, AWS`;

const marker = `qa-${Date.now()}`;
const createdUserIds = [];
let failures = 0;

function check(label, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

async function makeUser(suffix) {
  const [user] = await db
    .insert(users)
    .values({
      phone: `+9199${String(Date.now()).slice(-8)}${suffix}`,
      name: `QA ${marker} ${suffix}`,
    })
    .returning();
  createdUserIds.push(user.id);
  return user;
}

async function enqueue(userId, text) {
  const [row] = await db
    .insert(resumeParseAttempts)
    .values({
      userId,
      status: "queued",
      fileHash: `${marker}-${userId}`,
      fileName: "qa-resume.pdf",
      fileSizeBytes: 1024,
      duringOnboarding: true,
      resumeText: text,
    })
    .returning();
  return row;
}

async function cleanup() {
  for (const userId of createdUserIds) {
    const [profile] = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1);
    if (profile) {
      await db.delete(profileSections).where(eq(profileSections.profileId, profile.id));
      await db.delete(profiles).where(eq(profiles.id, profile.id));
    }
    await db.delete(resumeParseAttempts).where(eq(resumeParseAttempts.userId, userId));
    await db.delete(users).where(eq(users.id, userId));
  }
  console.log(`\nCleaned up ${createdUserIds.length} throwaway user(s).`);
}

try {
  console.log("--- 1. Concurrent jobs drain through the queue ---");
  const u1 = await makeUser(1);
  const u2 = await makeUser(2);
  const u3 = await makeUser(3);
  const a1 = await enqueue(u1.id, SAMPLE);
  const a2 = await enqueue(u2.id, SAMPLE);
  // Empty text must fail fast without touching a provider.
  const a3 = await enqueue(u3.id, "   ");

  const started = Date.now();
  const tick = await runResumeParseWorkerTick();
  console.log(`worker tick: ${JSON.stringify(tick)}  (${Date.now() - started}ms)`);

  const rows = await db
    .select()
    .from(resumeParseAttempts)
    .where(inArray(resumeParseAttempts.id, [a1.id, a2.id, a3.id]));
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));

  check("job 1 succeeded", byId[a1.id].status === "succeeded", `status=${byId[a1.id].status} model=${byId[a1.id].model}`);
  check("job 2 succeeded", byId[a2.id].status === "succeeded", `status=${byId[a2.id].status}`);
  check("empty-text job failed with no_text", byId[a3.id].status === "failed" && byId[a3.id].errorCode === "no_text", `code=${byId[a3.id].errorCode}`);
  check("resume_text cleared after completion", byId[a1.id].resumeText === null);
  check("result payload stored", !!byId[a1.id].result?.name, `name=${byId[a1.id].result?.name}`);

  console.log("\n--- 2. Parsed data landed on the profile ---");
  const [p1] = await db.select().from(profiles).where(eq(profiles.userId, u1.id)).limit(1);
  check("profile created", !!p1);
  const sections = await db.select().from(profileSections).where(eq(profileSections.profileId, p1.id));
  const byType = Object.fromEntries(sections.map((s) => [s.type, s.entries]));
  check("education section written", (byType.education || []).length > 0, `${(byType.education || []).length} entries`);
  check("experience section written", (byType.experience || []).length > 0, `${(byType.experience || []).length} entries`);
  check("skills section written", (byType.skills || []).length > 0, `${(byType.skills || []).length} skills`);
  check("contact email captured", !!byType.contact?.email, byType.contact?.email);

  const about = (byType.about || [])[0];
  const bio = about?.description || "";
  check("about summary is substantial", bio.length > 100, `${bio.length} chars`);
  console.log(`  summary: ${bio.slice(0, 220)}${bio.length > 220 ? "…" : ""}`);

  console.log("\n--- 3. Entitlement consumed once ---");
  const [freshUser] = await db.select().from(users).where(eq(users.id, u1.id)).limit(1);
  check("onboarding parse counted", (freshUser.onboardingSuccessfulParses || 0) === 1, `count=${freshUser.onboardingSuccessfulParses}`);

  console.log("\n--- 4. Cooldown only applies after a provider outage ---");
  const cooldownAfterNoText = await getParseCooldownRemainingMs(u3.id);
  check("no cooldown for a bad-PDF failure", cooldownAfterNoText === 0, `${cooldownAfterNoText}ms`);

  await db
    .update(resumeParseAttempts)
    .set({ status: "failed", errorCode: "provider_outage", completedAt: new Date() })
    .where(eq(resumeParseAttempts.id, a3.id));
  const cooldownAfterOutage = await getParseCooldownRemainingMs(u3.id);
  check("cooldown active after provider outage", cooldownAfterOutage > 9 * 60 * 1000, `${Math.round(cooldownAfterOutage / 1000)}s remaining`);

  console.log("\n--- 5. Stale claim recovery ---");
  const u4 = await makeUser(4);
  const a4 = await enqueue(u4.id, SAMPLE);
  await db
    .update(resumeParseAttempts)
    .set({ status: "processing", claimedAt: new Date(Date.now() - 60 * 60 * 1000) })
    .where(eq(resumeParseAttempts.id, a4.id));
  const recovery = await runResumeParseWorkerTick();
  const [after4] = await db.select().from(resumeParseAttempts).where(eq(resumeParseAttempts.id, a4.id));
  check("orphaned job was reclaimed and finished", after4.status === "succeeded", `status=${after4.status} reclaimed=${recovery.reclaimed}`);
} catch (err) {
  failures += 1;
  console.error("\nUNEXPECTED ERROR:", err);
} finally {
  await cleanup();
}

console.log(failures === 0 ? "\nAll queue checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
