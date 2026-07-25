/**
 * Manual check for the resume AI cascade.
 *   node scripts/verify-resume-cascade.mjs            # normal run (Gemini should win)
 *   BREAK_GEMINI=1 node scripts/verify-resume-cascade.mjs   # forces failover to OpenRouter
 *   BREAK_ALL=1 node scripts/verify-resume-cascade.mjs      # every provider down -> null
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../../..");
const envPath = path.join(rootDir, ".env");

if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    let val = trimmed.slice(idx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}

if (process.env.BREAK_GEMINI === "1" || process.env.BREAK_ALL === "1") {
  process.env.GOOGLE_API = "broken-key";
  process.env.GOOGLE_API_KEY = "broken-key";
  process.env.GEMINI_API_KEY = "broken-key";
}
if (process.env.BREAK_ALL === "1") {
  process.env.OPENROUTER_API_KEY = "broken-key";
  process.env.GROK_API_KEY = "broken-key";
  process.env.Grok_API_KEY = "broken-key";
}

const SAMPLE = `
Aarav Sharma
Bengaluru, India | aarav.sharma@example.com | +91 98765 43210
github.com/aaravsharma | linkedin.com/in/aaravsharma

EDUCATION
PSG College of Technology - B.E. Computer Science and Engineering, 2022 - 2026, CGPA 8.7

EXPERIENCE
Frontend Engineering Intern, Zoho Corporation, June 2025 - Present
- Built a React dashboard used by 400+ internal support agents
- Cut initial bundle size 38% by code-splitting and lazy routes

Open Source Contributor, Cal.com, Jan 2025 - May 2025
- Shipped timezone handling fixes for recurring bookings

PROJECTS
CampusRide - Carpooling app for college students. Next.js, PostgreSQL, Mapbox. 1,200 signups in first semester.
LeafSense - Plant disease detection using a MobileNet model served with FastAPI. Python, TensorFlow, Docker.

CERTIFICATES
AWS Certified Cloud Practitioner - Amazon Web Services, 2025

ACHIEVEMENTS
Winner, Smart India Hackathon 2024 - Ministry of Education
Runner-up, PSG Hacks 2023 - PSG Tech

SKILLS
JavaScript, TypeScript, React, Next.js, Node.js, Python, PostgreSQL, Docker, AWS, Figma, Tamil, English
`;

const { executeResilientResumeParsing, synthesizeProfileSummary } = await import(
  "../src/lib/aiResilienceEngine.ts"
);

const started = Date.now();
const parsed = await executeResilientResumeParsing(SAMPLE);

if (!parsed) {
  console.log(`\nRESULT: all providers failed (took ${Date.now() - started}ms)`);
  console.log("Route would mark the attempt failed -> user sees the 10-minute retry message.");
  process.exit(0);
}

console.log(`\nWinning provider: ${parsed.winningProvider}  (${Date.now() - started}ms)`);
console.log("name:", parsed.data.name);
console.log("headline:", parsed.data.headline);
console.log("education:", parsed.data.education?.length, "experience:", parsed.data.experience?.length);
console.log("projects:", parsed.data.projects?.length, "skills:", parsed.data.skills?.length);
console.log("parser bio:", parsed.data.bio);

const summary = await synthesizeProfileSummary(parsed.data);
console.log("\nSynthesized summary:\n", summary || "(none - kept parser bio)");
