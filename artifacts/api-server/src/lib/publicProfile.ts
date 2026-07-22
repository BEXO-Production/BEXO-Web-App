/**
 * Canonical public profile DTO for templates and Hire Me.
 * Phone numbers are always redacted at this boundary.
 */

type AnyRecord = Record<string, any>;

const asArray = (value: unknown): AnyRecord[] => {
  if (Array.isArray(value)) return value.filter((item) => item && typeof item === "object");
  if (value && typeof value === "object") return [value as AnyRecord];
  return [];
};

const asString = (value: unknown, fallback = ""): string => {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  return fallback;
};

const pickString = (entry: AnyRecord, keys: string[], fallback = ""): string => {
  for (const key of keys) {
    const value = asString(entry?.[key]);
    if (value) return value;
  }
  return fallback;
};

const normalizeLinks = (contact: AnyRecord, customLinks?: unknown) => {
  const links: { label: string; url: string }[] = [];
  const push = (label: string, url: string) => {
    const cleanUrl = asString(url);
    const cleanLabel = asString(label);
    if (!cleanUrl || !cleanLabel) return;
    if (links.some((link) => link.url === cleanUrl)) return;
    links.push({ label: cleanLabel, url: cleanUrl });
  };

  push("LinkedIn", contact.linkedin);
  push("GitHub", contact.github);
  push("Portfolio", contact.portfolio);

  const socials = asArray(contact.socials);
  for (const social of socials) {
    push(pickString(social, ["label", "name", "title"], "Link"), pickString(social, ["url", "href", "link"]));
  }

  const customs = asArray(customLinks ?? contact.customLinks);
  for (const link of customs) {
    push(pickString(link, ["label", "name", "title"], "Link"), pickString(link, ["url", "href", "link"]));
  }

  return links;
};

const normalizeAssets = (entry: AnyRecord) => {
  const assets = entry.assets && typeof entry.assets === "object" ? entry.assets : {};
  const images = [
    ...asArray(entry.images).map((img) => (typeof img === "string" ? img : asString(img?.url))),
    ...asArray(assets.images).map((img) => (typeof img === "string" ? img : asString(img?.url))),
  ].filter(Boolean);

  const pdfs = [
    ...asArray(entry.pdfs).map((pdf) => (typeof pdf === "string" ? pdf : asString(pdf?.url))),
    ...asArray(assets.pdfs).map((pdf) => (typeof pdf === "string" ? pdf : asString(pdf?.url))),
  ].filter(Boolean);

  return { images, pdfs };
};

const normalizeAbout = (entries: unknown, profile: AnyRecord) =>
  asArray(entries).map((entry, index) => ({
    id: asString(entry.id, String(index + 1)),
    title: pickString(entry, ["title", "headline"], asString(profile.headline)),
    description: pickString(entry, ["description", "bio"], asString(profile.bio)),
    bio: pickString(entry, ["bio", "description"], asString(profile.bio)),
    currentStatus: asString(entry.currentStatus),
    estYear: asString(entry.estYear),
    address: asString(entry.address),
    email: asString(entry.email),
  }));

const normalizeEducation = (entries: unknown) =>
  asArray(entries).map((entry, index) => {
    const startYear = pickString(entry, ["startYear", "startDate"]);
    const endYear = pickString(entry, ["endYear", "endDate"]);
    const year = pickString(entry, ["year", "duration"], [startYear, endYear].filter(Boolean).join(" - "));
    return {
      id: asString(entry.id, String(index + 1)),
      institution: pickString(entry, ["institution", "school", "college", "university"]),
      school: pickString(entry, ["institution", "school", "college", "university"]),
      degree: asString(entry.degree),
      startYear,
      endYear,
      year,
      duration: year,
      grade: asString(entry.grade),
    };
  });

const normalizeExperience = (entries: unknown) =>
  asArray(entries).map((entry, index) => {
    const startYear = pickString(entry, ["startYear", "startDate"]);
    const endYear = pickString(entry, ["endYear", "endDate"]);
    const duration = pickString(entry, ["duration"], [startYear, endYear].filter(Boolean).join(" - "));
    const responsibilities = Array.isArray(entry.responsibilities)
      ? entry.responsibilities.map((item: unknown) => asString(item)).filter(Boolean)
      : [];
    const description = asString(entry.description) || responsibilities.join("\n");
    return {
      id: asString(entry.id, String(index + 1)),
      company: asString(entry.company),
      role: asString(entry.role),
      startYear,
      endYear,
      startDate: startYear,
      endDate: endYear,
      duration,
      description,
      responsibilities: responsibilities.length ? responsibilities : description ? description.split("\n").filter(Boolean) : [],
      location: asString(entry.location),
    };
  });

const normalizeProjects = (entries: unknown) =>
  asArray(entries).map((entry, index) => {
    const { images, pdfs } = normalizeAssets(entry);
    return {
      id: asString(entry.id, String(index + 1)),
      title: asString(entry.title),
      category: asString(entry.category),
      description: asString(entry.description),
      techStack: pickString(entry, ["techStack", "tech"]),
      tech: pickString(entry, ["tech", "techStack"]),
      link: pickString(entry, ["link", "url", "href"]),
      role: asString(entry.role),
      year: asString(entry.year),
      duration: asString(entry.duration),
      images,
      pdfs,
      credits: entry.credits && typeof entry.credits === "object" ? entry.credits : undefined,
      assets: entry.assets || { mode: "images", images, pdfs, links: [] },
    };
  });

const normalizeCertificates = (entries: unknown) =>
  asArray(entries).map((entry, index) => {
    const { images, pdfs } = normalizeAssets(entry);
    const title = pickString(entry, ["title", "name"]);
    return {
      id: asString(entry.id, String(index + 1)),
      title,
      name: title,
      issuer: pickString(entry, ["issuer", "organization", "awarder"]),
      date: pickString(entry, ["date", "year"]),
      credentialLink: pickString(entry, ["credentialLink", "link", "url"]),
      images,
      pdfs,
      assets: entry.assets || { mode: "images", images, pdfs, links: [] },
    };
  });

const normalizeAchievements = (entries: unknown) =>
  asArray(entries).map((entry, index) => {
    const { images, pdfs } = normalizeAssets(entry);
    return {
      id: asString(entry.id, String(index + 1)),
      title: asString(entry.title),
      awarder: pickString(entry, ["awarder", "organization", "issuer"]),
      organization: pickString(entry, ["organization", "awarder", "issuer"]),
      year: pickString(entry, ["year", "date"]),
      date: pickString(entry, ["date", "year"]),
      project: asString(entry.project),
      images,
      pdfs,
      assets: entry.assets || { mode: "images", images, pdfs, links: [] },
    };
  });

const normalizeResearch = (entries: unknown) =>
  asArray(entries).map((entry, index) => {
    const { images, pdfs } = normalizeAssets(entry);
    const publication = pickString(entry, ["publication", "journal", "organization"]);
    return {
      id: asString(entry.id, String(index + 1)),
      title: asString(entry.title),
      authors: asString(entry.authors),
      publication,
      journal: publication,
      organization: pickString(entry, ["organization", "publication", "journal"]),
      year: pickString(entry, ["year", "date"]),
      date: pickString(entry, ["date", "year"]),
      link: pickString(entry, ["link", "url", "href"]),
      images,
      pdfs,
      assets: entry.assets || { mode: "images", images, pdfs, links: [] },
    };
  });

const SKILL_CATEGORIES = new Set(["technical", "tools", "soft", "languages"]);

export const MAX_SKILLS = 40;

export function normalizeSkills(entries: unknown) {
  const seen = new Set<string>();
  const out: { id: string; name: string; category: string }[] = [];
  const list = Array.isArray(entries)
    ? entries
    : entries && typeof entries === "object"
      ? [entries]
      : [];

  for (const raw of list) {
    if (out.length >= MAX_SKILLS) break;
    let name = "";
    let category = "technical";
    if (typeof raw === "string") {
      name = raw.trim();
    } else if (raw && typeof raw === "object") {
      const entry = raw as AnyRecord;
      name = pickString(entry, ["name", "title", "skill", "label"]);
      const cat = asString(entry.category, "technical").toLowerCase();
      category = SKILL_CATEGORIES.has(cat) ? cat : "technical";
    }
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ id: String(out.length + 1), name, category });
  }
  return out;
}

export type BuildPublicProfileInput = {
  profile: AnyRecord;
  user: AnyRecord;
  isPremium?: boolean;
  aboutEntries?: unknown;
  educationEntries?: unknown;
  experienceEntries?: unknown;
  projectEntries?: unknown;
  certificateEntries?: unknown;
  achievementEntries?: unknown;
  researchEntries?: unknown;
  skillEntries?: unknown;
  contactData?: AnyRecord;
};

/**
 * Build the canonical public profile payload injected into templates
 * and returned by public profile APIs. Phone is never included.
 */
export function buildPublicProfile(input: BuildPublicProfileInput) {
  const profile = input.profile || {};
  const user = input.user || {};
  const rawContact = input.contactData && typeof input.contactData === "object" ? input.contactData : {};
  const contactEmail = asString(rawContact.email) || asString(user.email);
  const socials = normalizeLinks(rawContact, rawContact.customLinks);

  const aboutEntries = normalizeAbout(input.aboutEntries, profile);
  const educationEntries = normalizeEducation(input.educationEntries);
  const experienceEntries = normalizeExperience(input.experienceEntries);
  const projectEntries = normalizeProjects(input.projectEntries);
  const certificateEntries = normalizeCertificates(input.certificateEntries);
  const achievementEntries = normalizeAchievements(input.achievementEntries);
  const researchEntries = normalizeResearch(input.researchEntries);
  const skillEntries = normalizeSkills(input.skillEntries);

  const contactData = {
    email: contactEmail,
    linkedin: asString(rawContact.linkedin),
    github: asString(rawContact.github),
    portfolio: asString(rawContact.portfolio),
    socials,
    customLinks: socials,
  };

  // Download Resume buttons follow the owner's default-resume preference:
  // 'uploaded' serves their own PDF, otherwise the system-generated ATS resume.
  // Falls back to whichever exists so the button never breaks.
  const uploadedResume = asString(user.resumeUrl);
  const generatedResume = asString(user.generatedResumeUrl);
  const resumeUrl =
    asString(user.defaultResume) === "uploaded"
      ? uploadedResume || generatedResume
      : generatedResume || uploadedResume;

  return {
    profile: {
      handle: asString(profile.handle),
      headline: asString(profile.headline),
      careerGoal: asString(profile.careerGoal),
      bio: asString(profile.bio),
      completionPct: typeof profile.completionPct === "number" ? profile.completionPct : 0,
    },
    user: {
      id: user.id,
      name: asString(user.name),
      email: contactEmail,
      photoUrl: asString(user.photoUrl),
      resumeUrl,
      openToHire: !!user.openToHire,
      templateId: asString(user.templateId, "minimal"),
      themeColor: asString(user.themeColor, "blue"),
      themeBg: asString(user.themeBg, "grid"),
    },
    isPremium: !!input.isPremium,
    aboutEntries,
    educationEntries,
    experienceEntries,
    projectEntries,
    certificateEntries,
    achievementEntries,
    researchEntries,
    skillEntries,
    contactData,
    // Nested shape for templates that still read sections.*
    sections: {
      about: { reviewed: true, entries: aboutEntries },
      education: { reviewed: true, entries: educationEntries },
      experience: { reviewed: true, entries: experienceEntries },
      projects: { reviewed: true, entries: projectEntries },
      certificates: { reviewed: true, entries: certificateEntries },
      achievements: { reviewed: true, entries: achievementEntries },
      research: { reviewed: true, entries: researchEntries },
      skills: { reviewed: true, entries: skillEntries },
      contact: {
        reviewed: true,
        entries: [
          {
            email: contactEmail,
            socials,
            address: asString(rawContact.address),
          },
        ],
      },
    },
  };
}
