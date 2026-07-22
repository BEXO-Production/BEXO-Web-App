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
  ],
  "skills": [
    { "name": "Skill or tool name (e.g. React, Python, Figma)", "category": "technical|tools|soft|languages" }
  ]
}

Fill every field with information extracted from the resume. If a category has no data, return an empty array or empty string. Extra links must be extracted with their names and full URLs.
For skills: extract from Skills / Technologies / Tools / Languages sections, and also pull distinct technologies mentioned in projects. Prefer 8–25 concise skill names. Use category technical for programming/frameworks, tools for software, soft for interpersonal, languages for spoken languages.`;

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

/**
 * Deterministic offline rule/regex parser fallback.
 * Guarantees 100% resume parsing uptime even if internet or remote AI APIs are completely down.
 */
export function fallbackHeuristicParser(text: string): ParsedResumeData {
  logger.info("Executing deterministic local heuristic fallback parser");
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);

  // Extract Email
  const emailMatch = text.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/);
  const email = emailMatch ? emailMatch[0] : "";

  // Extract Phone
  const phoneMatch = text.match(/(\+\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
  const phone = phoneMatch ? phoneMatch[0] : "";

  // Extract Name (assume top non-contact line)
  let name = "";
  for (const line of lines.slice(0, 5)) {
    if (line.includes("@") || line.match(/\d{5,}/) || line.toLowerCase().startsWith("resume") || line.toLowerCase().startsWith("curriculum")) {
      continue;
    }
    if (line.length >= 2 && line.length <= 40) {
      name = line;
      break;
    }
  }
  if (!name) name = "Portfolio Owner";

  // Extract Links
  const links: { name: string; url: string }[] = [];
  const urlMatches = text.matchAll(/https?:\/\/[^\s<>()]+/g);
  for (const m of urlMatches) {
    const url = m[0];
    let linkName = "Portfolio Link";
    if (url.includes("github.com")) linkName = "GitHub";
    else if (url.includes("linkedin.com")) linkName = "LinkedIn";
    links.push({ name: linkName, url });
  }

  // Extract common tech skills
  const commonSkills = [
    "JavaScript", "TypeScript", "React", "Node.js", "Python", "Java", "C++", "HTML", "CSS",
    "Tailwind", "SQL", "PostgreSQL", "MongoDB", "Docker", "Git", "AWS", "Figma", "REST API",
    "Express", "Next.js", "Vue", "Angular", "Linux", "Communication", "Problem Solving"
  ];
  const foundSkills: { name: string; category: string }[] = [];
  const textLower = text.toLowerCase();
  for (const skill of commonSkills) {
    if (textLower.includes(skill.toLowerCase())) {
      foundSkills.push({ name: skill, category: "technical" });
    }
  }

  return {
    name,
    headline: "Professional Portfolio",
    bio: lines.slice(0, 3).join(" ").slice(0, 250),
    email,
    phone,
    pronouns: "He/Him",
    links,
    education: [],
    experience: [],
    projects: [],
    certificates: [],
    achievements: [],
    skills: foundSkills
  };
}

/**
 * Resilient multi-tier AI execution engine with silent background fallback.
 */
export async function executeResilientResumeParsing(resumeText: string): Promise<{ data: ParsedResumeData; winningProvider: string }> {
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  const grokKey = process.env.Grok_API_KEY || process.env.GROK_API_KEY;
  const geminiKey = process.env.GOOGLE_API || process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;

  const providers: { name: string; execute: () => Promise<any> }[] = [];

  // Helper for OpenRouter
  if (openRouterKey) {
    const openRouterModels = [
      process.env.OPENROUTER_MODEL,
      process.env.OPENROUTER_BACKUP_MODEL,
      process.env.OPENROUTER_BACKUP_MODEL_2,
      "openrouter/free",
      "meta-llama/llama-3.3-70b-instruct:free",
      "google/gemma-2-9b-it:free"
    ].filter(Boolean) as string[];

    const uniqueOpenRouterModels = Array.from(new Set(openRouterModels));
    for (const model of uniqueOpenRouterModels) {
      providers.push({
        name: `OpenRouter (${model})`,
        execute: async () => {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 12000);
          try {
            const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${openRouterKey}`,
                "HTTP-Referer": "https://atbexo.com",
                "X-Title": "Bexo Onboarding"
              },
              body: JSON.stringify({
                model,
                messages: [
                  { role: "system", content: RESUME_SYSTEM_PROMPT },
                  { role: "user", content: resumeText }
                ],
                response_format: { type: "json_object" }
              }),
              signal: controller.signal
            });
            clearTimeout(timeoutId);
            if (!res.ok) throw new Error(`OpenRouter HTTP ${res.status}: ${await res.text()}`);
            const json = (await res.json()) as any;
            const content = json.choices?.[0]?.message?.content || "";
            return parseAndSanitizeJSON(content);
          } catch (err) {
            clearTimeout(timeoutId);
            throw err;
          }
        }
      });
    }
  }

  // Helper for Grok AI
  if (grokKey) {
    const grokModels = [
      process.env.GROK_MODEL || "grok-latest",
      process.env.GROK_BACKUP_MODEL || "grok-3-mini"
    ];
    for (const model of Array.from(new Set(grokModels))) {
      providers.push({
        name: `Grok AI (${model})`,
        execute: async () => {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 12000);
          try {
            const res = await fetch("https://api.x.ai/v1/chat/completions", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${grokKey}`
              },
              body: JSON.stringify({
                model,
                messages: [
                  { role: "system", content: RESUME_SYSTEM_PROMPT },
                  { role: "user", content: resumeText }
                ],
                response_format: { type: "json_object" }
              }),
              signal: controller.signal
            });
            clearTimeout(timeoutId);
            if (!res.ok) throw new Error(`Grok HTTP ${res.status}: ${await res.text()}`);
            const json = (await res.json()) as any;
            const content = json.choices?.[0]?.message?.content || "";
            return parseAndSanitizeJSON(content);
          } catch (err) {
            clearTimeout(timeoutId);
            throw err;
          }
        }
      });
    }
  }

  // Helper for Google Gemini AI
  if (geminiKey) {
    const geminiModels = [
      process.env.GEMINI_MODEL || "gemini-2.5-flash",
      process.env.GEMINI_BACKUP_MODEL || "gemini-3.5-flash"
    ];
    for (const model of Array.from(new Set(geminiModels))) {
      providers.push({
        name: `Google Gemini (${model})`,
        execute: async () => {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 12000);
          try {
            const res = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  contents: [{ parts: [{ text: `${RESUME_SYSTEM_PROMPT}\n\nRESUME TEXT:\n${resumeText}` }] }],
                  generationConfig: { responseMimeType: "application/json" }
                }),
                signal: controller.signal
              }
            );
            clearTimeout(timeoutId);
            if (!res.ok) throw new Error(`Gemini HTTP ${res.status}: ${await res.text()}`);
            const json = (await res.json()) as any;
            const content = json.candidates?.[0]?.content?.parts?.[0]?.text || "";
            return parseAndSanitizeJSON(content);
          } catch (err) {
            clearTimeout(timeoutId);
            throw err;
          }
        }
      });
    }
  }

  // Ultimate Offline Safety Net
  providers.push({
    name: "Deterministic Offline Rule Engine",
    execute: async () => fallbackHeuristicParser(resumeText)
  });

  // Execute silent background fallback loop
  for (const provider of providers) {
    try {
      logger.info({ provider: provider.name }, "Attempting AI resume parsing provider");
      const parsedData = await provider.execute();
      if (parsedData && (parsedData.name || parsedData.email || parsedData.headline || (parsedData.skills && parsedData.skills.length > 0))) {
        logger.info({ winningProvider: provider.name }, "AI resume parsing succeeded");
        return { data: parsedData, winningProvider: provider.name };
      }
    } catch (err: any) {
      logger.warn({ err: err.message, provider: provider.name }, "AI provider failed in silent fallback cascade; switching to next provider");
    }
  }

  // Final fallback guaranteed return
  const data = fallbackHeuristicParser(resumeText);
  return { data, winningProvider: "Deterministic Offline Rule Engine (Emergency)" };
}
