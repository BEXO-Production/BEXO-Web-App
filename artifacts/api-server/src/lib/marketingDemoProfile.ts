import { existsSync } from "node:fs";
import path from "node:path";
import { buildPublicProfile } from "./publicProfile";

/**
 * Reserved marketing handle for landing-page template previews.
 * Never maps to a real user — fictional persona + AI-generated assets only.
 */
export const MARKETING_DEMO_HANDLE = "bexo-demo";

/**
 * Absolute directory served at /api/marketing-demo/*.
 * pnpm/dev cwd is artifacts/api-server; Cloud Run cwd is the monorepo root.
 */
export const MARKETING_DEMO_ASSETS_DIR = (() => {
  const candidates = [
    path.resolve(process.cwd(), "public", "marketing-demo"),
    path.resolve(process.cwd(), "artifacts", "api-server", "public", "marketing-demo"),
  ];
  return candidates.find((dir) => existsSync(dir)) || candidates[0];
})();

const DEMO_ASSET_VERSION = "20260720";
const asset = (file: string) =>
  `/api/marketing-demo/${file}?v=${DEMO_ASSET_VERSION}`;

/**
 * Fictional showcase profile used exclusively for marketing iframes.
 * No real student data — AI portrait + project stills + invented resume.
 */
export function getMarketingDemoProfile(templateOverride?: string) {
  const templateId =
    templateOverride && templateOverride !== "minimal"
      ? templateOverride
      : "cura-futuri";

  return buildPublicProfile({
    isPremium: true,
    profile: {
      handle: MARKETING_DEMO_HANDLE,
      headline: "Product Designer & Brand Strategist",
      careerGoal: "Design digital products that feel inevitable.",
      bio: "I help early-stage teams turn messy ideas into calm, conversion-ready experiences — from research to polished UI systems.",
      completionPct: 100,
    },
    user: {
      id: "marketing-demo-aria",
      name: "Aria Mehta",
      email: "hello@ariamehta.studio",
      photoUrl: asset("portrait.jpg"),
      resumeUrl: "",
      openToHire: true,
      templateId,
      themeColor: "blue",
      themeBg: "grid",
    },
    aboutEntries: [
      {
        id: "1",
        title: "Product Designer & Brand Strategist",
        description:
          "I help early-stage teams turn messy ideas into calm, conversion-ready experiences — from research to polished UI systems.",
        bio: "I help early-stage teams turn messy ideas into calm, conversion-ready experiences — from research to polished UI systems.",
        currentStatus: "Independent designer · Available for select retainers",
        estYear: "2019",
        address: "Bengaluru, IN · Remote",
        email: "hello@ariamehta.studio",
      },
    ],
    educationEntries: [
      {
        id: "1",
        institution: "National Institute of Design",
        degree: "B.Des — Communication Design",
        startYear: "2015",
        endYear: "2019",
        grade: "Distinction",
      },
      {
        id: "2",
        institution: "Interaction Design Foundation",
        degree: "UX Research Specialization",
        startYear: "2020",
        endYear: "2021",
        grade: "",
      },
    ],
    experienceEntries: [
      {
        id: "1",
        company: "Northline Studio",
        role: "Senior Product Designer",
        startYear: "2022",
        endYear: "Present",
        location: "Remote",
        description:
          "Lead end-to-end product design for B2B SaaS clients. Shipped design systems, onboarding flows, and marketing sites that lifted activation by 28%.",
      },
      {
        id: "2",
        company: "Lumen Labs",
        role: "Brand & UI Designer",
        startYear: "2019",
        endYear: "2022",
        location: "Bengaluru",
        description:
          "Built visual identity and product UI for two venture-backed startups. Owned Figma libraries, motion guidelines, and launch campaigns.",
      },
    ],
    projectEntries: [
      {
        id: "1",
        title: "Orbit Pay — Fintech redesign",
        category: "Product Design",
        description:
          "Reimagined a payments dashboard for clarity and trust. New information architecture, empty states, and a responsive design system.",
        techStack: "Figma · Prototyping · Design Systems",
        role: "Lead Designer",
        year: "2024",
        images: [asset("project-1.jpg")],
        assets: { mode: "images", images: [asset("project-1.jpg")], pdfs: [], links: [] },
      },
      {
        id: "2",
        title: "Atelier — Creative toolkit",
        category: "Brand & Web",
        description:
          "Brand system and marketing site for a creative tooling startup. Warm editorial type, modular layouts, and conversion-focused landing pages.",
        techStack: "Brand · Web Design · Motion",
        role: "Art Direction",
        year: "2023",
        images: [asset("project-2.jpg")],
        assets: { mode: "images", images: [asset("project-2.jpg")], pdfs: [], links: [] },
      },
      {
        id: "3",
        title: "Forma — Identity studies",
        category: "Visual Identity",
        description:
          "Exploratory identity system built around geometric paper forms — used across packaging concepts and digital brand moments.",
        techStack: "Identity · Photography · Art Direction",
        role: "Designer",
        year: "2023",
        images: [asset("project-3.jpg")],
        assets: { mode: "images", images: [asset("project-3.jpg")], pdfs: [], links: [] },
      },
    ],
    certificateEntries: [
      {
        id: "1",
        title: "Google UX Design Certificate",
        organization: "Coursera",
        year: "2021",
        images: [],
        pdfs: [],
      },
    ],
    achievementEntries: [
      {
        id: "1",
        title: "Awwwards Honorable Mention",
        description: "Atelier marketing site",
        year: "2023",
      },
      {
        id: "2",
        title: "Featured in Design Collective Asia",
        description: "Emerging designer spotlight",
        year: "2024",
      },
    ],
    researchEntries: [],
    contactData: {
      email: "hello@ariamehta.studio",
      linkedin: "https://linkedin.com/in/example-aria-mehta",
      github: "https://github.com/example-aria",
      portfolio: "https://ariamehta.studio",
    },
  });
}

export function isMarketingDemoHandle(handle: string | null | undefined): boolean {
  return String(handle || "")
    .toLowerCase()
    .trim() === MARKETING_DEMO_HANDLE;
}
