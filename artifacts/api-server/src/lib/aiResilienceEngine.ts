import { logger } from "./logger";

export interface ParsedResumeData {
  name?: string;
  headline?: string;
  bio?: string;
  email?: string;
  phone?: string;
  pronouns?: string;
  links?: { name: string; url: string }[];
  education?: { institution: string; degree: string; year: string; grade?: string }[];
  experience?: { company: string; role: string; duration: string; description: string }[];
  projects?: { title: string; description: string; tech: string }[];
  certificates?: { title: string; issuer: string; date: string }[];
  achievements?: { title: string; organization: string; date: string }[];
  skills?: { name: string; category: string }[];
}

export const RESUME_SYSTEM_PROMPT = `You are an expert resume parsing AI assistant.
Your task is to extract professional information from the provided resume text and format it into a structured JSON object.
Return ONLY a valid JSON object. Do not include any explanations, introduction, markdown blocks, or extra text.

The JSON structure must match this schema exactly:
{
  "name": "Candidate's full name",
  "headline": "A short, professional headline (e.g. Frontend Developer Intern)",
  "bio": "A professional executive summary. FIRST check if the resume contains an existing Summary or Objective section. If it exists, summarize and condense it into LESS THAN 200 WORDS (ideally under 200 characters, concise and high-impact). If no summary exists in the resume, synthesize a professional bio from the extracted experience, education, and skills in LESS THAN 200 WORDS.",
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
  ],
  "skills": [
    { "name": "Skill or tool name (e.g. React, Python, Figma)", "category": "technical|tools|soft|languages" }
  ]
}

Fill every field with information extracted from the resume. If a category has no data, return an empty array or empty string. Extra links must be extracted with their names and full URLs.
For skills: extract from Skills / Technologies / Tools / Languages sections, and also pull distinct technologies mentioned in projects. Prefer 8–25 concise skill names. Use category technical for programming/frameworks, tools for software, soft for interpersonal, languages for spoken languages.`;

const SUMMARY_SYSTEM_PROMPT = `You write the "About" summary for a student/early-career portfolio website.
You receive a JSON object holding everything known about one candidate: name, headline, education, experience, projects, certificates, achievements and skills.

Write ONE cohesive professional summary that reads like a human wrote it about this specific person.

Rules:
- STRICT LENGTH LIMIT: Must be LESS THAN 200 WORDS (ideally 35 to 85 words, maximum 200 characters).
- Check if an existing summary exists in the data. If so, summarize it under 200 words. Otherwise synthesize from experience & skills.
- Third person, present tense, warm but professional. Never use "I" or "we".
- Ground every claim in the supplied JSON. Never invent employers, degrees, dates, metrics or tools.
- Weave together the strongest signals: current study or role, the most relevant experience, one or two standout projects or achievements, and the core skill areas.
- Name real technologies and organisations from the data instead of generic phrases like "various technologies".
- No bullet points, no headings, no markdown, no emoji, no closing call to action.

Return ONLY valid JSON in exactly this shape:
{ "bio": "the summary text" }`;

/** Hard ceiling on prompt size so one huge PDF cannot stall a worker slot. */
const MAX_RESUME_CHARS = Number(process.env.AI_MAX_RESUME_CHARS || 24_000);
/** Per-model request timeout for the structured parse. */
const CALL_TIMEOUT_MS = Number(process.env.AI_CALL_TIMEOUT_MS || 60_000);
/** Whole-cascade budget for the parse: once exceeded we stop trying further models. */
const CASCADE_BUDGET_MS = Number(process.env.AI_CASCADE_BUDGET_MS || 150_000);
/** The summary is a nice-to-have, so it gets a much tighter leash. */
const SUMMARY_CALL_TIMEOUT_MS = Number(process.env.AI_SUMMARY_CALL_TIMEOUT_MS || 25_000);
const SUMMARY_BUDGET_MS = Number(process.env.AI_SUMMARY_BUDGET_MS || 45_000);

/**
 * Robust JSON extraction & sanitization helper.
 * Repairs markdown blocks, trailing commas, unescaped control characters, etc.
 */
export function parseAndSanitizeJSON(raw: string): any {
  if (!raw || typeof raw !== "string") return null;

  let cleaned = raw.trim();
  // Strip markdown code fences if present
  cleaned = cleaned.replace(/^```(json)?/i, "").replace(/```$/, "").trim();

  // Find boundaries of outer JSON object
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");

  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error("No JSON object bounds found in raw response");
  }

  cleaned = cleaned.substring(firstBrace, lastBrace + 1);

  // Sanitization: fix trailing commas before closing braces/brackets
  cleaned = cleaned.replace(/,\s*([}\]])/g, "$1");

  try {
    return JSON.parse(cleaned);
  } catch (parseErr) {
    // Advanced recovery: replace raw newlines in quotes
    try {
      const sanitizedQuotes = cleaned.replace(/"([^"\\]*(\\.[^"\\]*)*)"/g, (match) => {
        return match.replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t");
      });
      return JSON.parse(sanitizedQuotes);
    } catch (secondErr) {
      throw new Error(`JSON parse failed: ${(parseErr as Error).message}`);
    }
  }
}

type Stage = "gemini" | "openrouter" | "grok";

type CascadeCall = {
  /** Human-readable label used only in server logs. */
  name: string;
  stage: Stage;
  /** 0 = the stage's primary model, 1 = its backup. */
  tier: number;
  execute: (systemPrompt: string, userContent: string, timeoutMs: number) => Promise<string>;
};

class ProviderHttpError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

/**
 * Skips models that just told us they are unusable (revoked key, no credits,
 * exhausted quota). Without this, every parse would re-pay the latency cost of
 * a dead provider before reaching a working one.
 */
const breaker = new Map<string, number>();
const BREAKER_HARD_MS = Number(process.env.AI_BREAKER_HARD_MS || 10 * 60 * 1000);
const BREAKER_RATE_MS = Number(process.env.AI_BREAKER_RATE_MS || 60 * 1000);

function isTripped(name: string): boolean {
  const until = breaker.get(name);
  if (!until) return false;
  if (Date.now() >= until) {
    breaker.delete(name);
    return false;
  }
  return true;
}

function tripBreaker(name: string, status: number | undefined): void {
  if (!status) return;
  // 401/403/404 = key or model is wrong; 429 = temporarily rate limited.
  if (status === 401 || status === 403 || status === 404) {
    breaker.set(name, Date.now() + BREAKER_HARD_MS);
  } else if (status === 429) {
    breaker.set(name, Date.now() + BREAKER_RATE_MS);
  }
}

function uniqueModels(models: (string | undefined)[]): string[] {
  return Array.from(new Set(models.filter(Boolean) as string[]));
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

/** OpenAI-compatible chat completion call, used by OpenRouter and Grok. */
function chatCompletionCall(
  label: string,
  url: string,
  apiKey: string,
  model: string,
  extraHeaders: Record<string, string> = {},
) {
  return async (systemPrompt: string, userContent: string, timeoutMs: number): Promise<string> => {
    const res = await fetchWithTimeout(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          ...extraHeaders,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userContent },
          ],
          response_format: { type: "json_object" },
        }),
      },
      timeoutMs,
    );
    if (!res.ok) throw new ProviderHttpError(`${label} HTTP ${res.status}`, res.status);
    const json = (await res.json()) as any;
    return json.choices?.[0]?.message?.content || "";
  };
}

/**
 * Provider priority: Gemini -> OpenRouter -> Grok.
 *
 * Calls are ordered by tier before stage, so round one asks each provider's
 * primary model in priority order and only then falls back to backups. A stage
 * that is slow or broken therefore cannot consume the budget that the next
 * provider needs.
 */
function buildCascade(): CascadeCall[] {
  const geminiKey = process.env.GOOGLE_API || process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  const grokKey = process.env.Grok_API_KEY || process.env.GROK_API_KEY;

  const cascade: CascadeCall[] = [];

  if (geminiKey) {
    const models = uniqueModels([
      process.env.GEMINI_MODEL || "gemini-2.5-flash",
      process.env.GEMINI_BACKUP_MODEL || "gemini-2.0-flash",
    ]).slice(0, 2);

    models.forEach((model, tier) => {
      cascade.push({
        name: `Google Gemini (${model})`,
        stage: "gemini",
        tier,
        execute: async (systemPrompt, userContent, timeoutMs) => {
          const res = await fetchWithTimeout(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents: [{ parts: [{ text: `${systemPrompt}\n\nINPUT:\n${userContent}` }] }],
                generationConfig: { responseMimeType: "application/json" },
              }),
            },
            timeoutMs,
          );
          if (!res.ok) throw new ProviderHttpError(`Gemini HTTP ${res.status}`, res.status);
          const json = (await res.json()) as any;
          return json.candidates?.[0]?.content?.parts?.[0]?.text || "";
        },
      });
    });
  }

  if (openRouterKey) {
    const models = uniqueModels([
      process.env.OPENROUTER_MODEL || "nvidia/nemotron-3-super-120b-a12b:free",
      process.env.OPENROUTER_BACKUP_MODEL || "openai/gpt-oss-20b:free",
    ]).slice(0, 2);

    models.forEach((model, tier) => {
      cascade.push({
        name: `OpenRouter (${model})`,
        stage: "openrouter",
        tier,
        execute: chatCompletionCall(
          "OpenRouter",
          "https://openrouter.ai/api/v1/chat/completions",
          openRouterKey,
          model,
          { "HTTP-Referer": "https://atbexo.com", "X-Title": "Bexo Onboarding" },
        ),
      });
    });
  }

  if (grokKey) {
    const models = uniqueModels([
      process.env.GROK_MODEL || "grok-latest",
      process.env.GROK_BACKUP_MODEL || "grok-3-mini",
    ]).slice(0, 2);

    models.forEach((model, tier) => {
      cascade.push({
        name: `Grok AI (${model})`,
        stage: "grok",
        tier,
        execute: chatCompletionCall("Grok", "https://api.x.ai/v1/chat/completions", grokKey, model),
      });
    });
  }

  const stageRank: Record<Stage, number> = { gemini: 0, openrouter: 1, grok: 2 };
  return cascade.sort((a, b) => a.tier - b.tier || stageRank[a.stage] - stageRank[b.stage]);
}

/**
 * Runs one prompt down the provider cascade until a response satisfies `accept`.
 * Provider errors stay in server logs — callers never surface them to users.
 */
async function runCascade<T>(
  systemPrompt: string,
  userContent: string,
  accept: (parsed: any) => T | null,
  task: string,
  limits: { callTimeoutMs: number; budgetMs: number },
): Promise<{ data: T; winningProvider: string } | null> {
  const cascade = buildCascade();
  if (cascade.length === 0) {
    logger.error({ task }, "No AI provider credentials configured for resume intelligence");
    return null;
  }

  // Never let the breaker starve a request completely: if everything is tripped,
  // reset and make one honest attempt rather than failing blind.
  let candidates = cascade.filter((p) => !isTripped(p.name));
  if (candidates.length === 0) {
    breaker.clear();
    candidates = cascade;
  }

  const deadline = Date.now() + limits.budgetMs;
  let attempted = 0;

  for (const provider of candidates) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      logger.warn({ task, attempted }, "AI cascade budget exhausted before all providers were tried");
      break;
    }

    attempted += 1;
    try {
      const raw = await provider.execute(
        systemPrompt,
        userContent,
        Math.min(limits.callTimeoutMs, remaining),
      );
      const parsed = parseAndSanitizeJSON(raw);
      const accepted = accept(parsed);
      if (accepted != null) {
        logger.info({ task, winningProvider: provider.name }, "AI cascade succeeded");
        return { data: accepted, winningProvider: provider.name };
      }
      logger.warn({ task, provider: provider.name }, "AI provider returned unusable payload; falling through");
    } catch (err: any) {
      tripBreaker(provider.name, err instanceof ProviderHttpError ? err.status : undefined);
      logger.warn(
        { task, provider: provider.name, err: err?.message || String(err) },
        "AI provider failed in silent fallback cascade; switching to next provider",
      );
    }
  }

  logger.error({ task, attempted }, "All AI providers failed");
  return null;
}

function hasUsableResumeSignal(parsed: any): boolean {
  if (!parsed || typeof parsed !== "object") return false;
  return Boolean(
    parsed.name ||
      parsed.email ||
      parsed.headline ||
      (Array.isArray(parsed.skills) && parsed.skills.length > 0) ||
      (Array.isArray(parsed.experience) && parsed.experience.length > 0) ||
      (Array.isArray(parsed.education) && parsed.education.length > 0),
  );
}

/**
 * Structured resume extraction with silent Gemini -> OpenRouter -> Grok failover.
 * Returns null only when every provider failed; callers then ask the user to retry later.
 */
export async function executeResilientResumeParsing(
  resumeText: string,
): Promise<{ data: ParsedResumeData; winningProvider: string } | null> {
  const trimmed = (resumeText || "").slice(0, MAX_RESUME_CHARS);
  if (!trimmed.trim()) return null;

  return runCascade<ParsedResumeData>(
    RESUME_SYSTEM_PROMPT,
    `RESUME TEXT:\n${trimmed}`,
    (parsed) => (hasUsableResumeSignal(parsed) ? (parsed as ParsedResumeData) : null),
    "resume_parse",
    { callTimeoutMs: CALL_TIMEOUT_MS, budgetMs: CASCADE_BUDGET_MS },
  );
}

/** Compact projection of the parsed profile used as grounding for the summary. */
function buildSummaryContext(parsed: ParsedResumeData): string {
  const context = {
    name: parsed.name || "",
    headline: parsed.headline || "",
    education: (parsed.education || []).slice(0, 4).map((e) => ({
      institution: e?.institution || "",
      degree: e?.degree || "",
      year: e?.year || "",
      grade: e?.grade || "",
    })),
    experience: (parsed.experience || []).slice(0, 5).map((e) => ({
      company: e?.company || "",
      role: e?.role || "",
      duration: e?.duration || "",
      highlights: String(e?.description || "").slice(0, 400),
    })),
    projects: (parsed.projects || []).slice(0, 5).map((p) => ({
      title: p?.title || "",
      description: String(p?.description || "").slice(0, 300),
      tech: p?.tech || "",
    })),
    certificates: (parsed.certificates || []).slice(0, 5).map((c) => ({
      title: c?.title || "",
      issuer: c?.issuer || "",
    })),
    achievements: (parsed.achievements || []).slice(0, 5).map((a) => ({
      title: a?.title || "",
      organization: a?.organization || "",
    })),
    skills: (parsed.skills || []).slice(0, 25).map((s) => s?.name).filter(Boolean),
  };
  return JSON.stringify(context);
}

/**
 * Second pass that turns the full extracted profile into one grounded "About"
 * summary. Failure is non-fatal: the caller keeps the parser's own bio.
 */
export async function synthesizeProfileSummary(parsed: ParsedResumeData): Promise<string | null> {
  const hasSubstance =
    (parsed.education?.length || 0) +
      (parsed.experience?.length || 0) +
      (parsed.projects?.length || 0) +
      (parsed.achievements?.length || 0) >
    0;
  if (!hasSubstance && !parsed.headline) return null;

  const result = await runCascade<string>(
    SUMMARY_SYSTEM_PROMPT,
    buildSummaryContext(parsed),
    (payload) => {
      const bio = typeof payload?.bio === "string" ? payload.bio.trim() : "";
      // Guard against one-liners and runaway essays.
      if (bio.length < 80 || bio.length > 1200) return null;
      return bio;
    },
    "resume_summary",
    { callTimeoutMs: SUMMARY_CALL_TIMEOUT_MS, budgetMs: SUMMARY_BUDGET_MS },
  );

  return result?.data ?? null;
}
