import type {
  AchievementEntry,
  CertificateEntry,
  EducationEntry,
  ExperienceEntry,
  ProjectEntry,
  ResearchEntry,
} from "./profile-api";

/** One text field in an entry form. `yearRange` renders start/end inputs
 * plus a "Present"/"Still there" checkbox that sets the end value to the
 * literal string "Present" — same sentinel bexo-web's editor uses (see
 * step-6.tsx), so entries read the same on both platforms. */
export type FieldDef =
  | { key: string; label: string; kind: "text"; placeholder?: string }
  | { key: string; label: string; kind: "textarea"; placeholder?: string }
  | { key: string; startKey: string; endKey: string; startLabel: string; endLabel: string; kind: "yearRange" };

export interface SectionConfig<T extends { id: string }> {
  type: "education" | "experience" | "project" | "certificate" | "achievement" | "research";
  title: string;
  addLabel: string;
  emptyBody: string;
  fields: FieldDef[];
  empty: () => Omit<T, "id">;
  summary: (entry: T) => string;
  heading: (entry: T) => string;
}

const yearRangeStr = (start: string, end: string) => {
  if (!start && !end) return "";
  return `${start || "?"} – ${end || "?"}`;
};

export const EDUCATION_CONFIG: SectionConfig<EducationEntry> = {
  type: "education",
  title: "Education",
  addLabel: "Add education",
  emptyBody: "Add your degrees, schools, or courses.",
  fields: [
    { key: "institution", label: "Institution", kind: "text" },
    { key: "degree", label: "Degree", kind: "text" },
    { key: "startYear", startKey: "startYear", endKey: "endYear", startLabel: "Start year", endLabel: "End year", kind: "yearRange" },
    { key: "grade", label: "Grade / CGPA", kind: "text" },
  ],
  empty: () => ({ institution: "", degree: "", startYear: "", endYear: "", grade: "" }),
  heading: (e) => e.institution || "New education",
  summary: (e) => [e.degree, yearRangeStr(e.startYear, e.endYear), e.grade].filter(Boolean).join(" · "),
};

export const EXPERIENCE_CONFIG: SectionConfig<ExperienceEntry> = {
  type: "experience",
  title: "Experience",
  addLabel: "Add experience",
  emptyBody: "Add jobs, internships, or roles you've held.",
  fields: [
    { key: "company", label: "Company", kind: "text" },
    { key: "role", label: "Role", kind: "text" },
    { key: "startYear", startKey: "startYear", endKey: "endYear", startLabel: "Start (e.g. 01/2024)", endLabel: "End (e.g. 11/2025)", kind: "yearRange" },
    { key: "description", label: "Description", kind: "textarea" },
  ],
  empty: () => ({ company: "", role: "", startYear: "", endYear: "", description: "" }),
  heading: (e) => e.company || "New experience",
  summary: (e) => [e.role, yearRangeStr(e.startYear, e.endYear)].filter(Boolean).join(" · "),
};

export const PROJECT_CONFIG: SectionConfig<ProjectEntry> = {
  type: "project",
  title: "Projects",
  addLabel: "Add project",
  emptyBody: "Add things you've built.",
  fields: [
    { key: "title", label: "Project title", kind: "text" },
    { key: "description", label: "Description", kind: "textarea" },
    { key: "tech", label: "Technologies", kind: "text", placeholder: "e.g. React Native, Postgres" },
  ],
  empty: () => ({ title: "", description: "", tech: "" }),
  heading: (e) => e.title || "New project",
  summary: (e) => e.tech || e.description || "",
};

export const CERTIFICATE_CONFIG: SectionConfig<CertificateEntry> = {
  type: "certificate",
  title: "Certificates",
  addLabel: "Add certificate",
  emptyBody: "Add licenses or credentials you've earned.",
  fields: [
    { key: "title", label: "Title", kind: "text" },
    { key: "issuer", label: "Issuer", kind: "text" },
    { key: "date", label: "Date", kind: "text", placeholder: "e.g. Mar 2024" },
  ],
  empty: () => ({ title: "", issuer: "", date: "" }),
  heading: (e) => e.title || "New certificate",
  summary: (e) => [e.issuer, e.date].filter(Boolean).join(" · "),
};

export const ACHIEVEMENT_CONFIG: SectionConfig<AchievementEntry> = {
  type: "achievement",
  title: "Achievements",
  addLabel: "Add achievement",
  emptyBody: "Add awards or recognition you've received.",
  fields: [
    { key: "title", label: "Title", kind: "text" },
    { key: "organization", label: "Organization", kind: "text" },
    { key: "date", label: "Date", kind: "text", placeholder: "e.g. Mar 2024" },
  ],
  empty: () => ({ title: "", organization: "", date: "" }),
  heading: (e) => e.title || "New achievement",
  summary: (e) => [e.organization, e.date].filter(Boolean).join(" · "),
};

export const RESEARCH_CONFIG: SectionConfig<ResearchEntry> = {
  type: "research",
  title: "Research",
  addLabel: "Add research",
  emptyBody: "Add papers or publications.",
  fields: [
    { key: "title", label: "Title", kind: "text" },
    { key: "organization", label: "Publication / Journal", kind: "text" },
    { key: "date", label: "Date", kind: "text", placeholder: "e.g. Mar 2024" },
  ],
  empty: () => ({ title: "", organization: "", date: "" }),
  heading: (e) => e.title || "New research entry",
  summary: (e) => [e.organization, e.date].filter(Boolean).join(" · "),
};

export const SECTION_CONFIGS = {
  education: EDUCATION_CONFIG,
  experience: EXPERIENCE_CONFIG,
  project: PROJECT_CONFIG,
  certificate: CERTIFICATE_CONFIG,
  achievement: ACHIEVEMENT_CONFIG,
  research: RESEARCH_CONFIG,
} as const;

export type SectionType = keyof typeof SECTION_CONFIGS;

export function newEntryId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
