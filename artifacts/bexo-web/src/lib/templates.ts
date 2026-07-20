/** Canonical BEXO portfolio template catalog (onboarding + dashboard). */
export type PortfolioTemplate = {
  id: string;
  name: string;
  description: string;
  isPro: boolean;
  /** Live iframe preview available via /api/render/:handle/:id */
  previewable: boolean;
  /** Visual family for thumbnail mockups */
  mockup: "minimal" | "cura" | "sierra" | "nico";
};

/** Reserved fictional handle for marketing landing previews — never a real user */
export const MARKETING_DEMO_HANDLE = "bexo-demo";

export const PORTFOLIO_TEMPLATES: PortfolioTemplate[] = [
  {
    id: "minimal",
    name: "Minimal",
    description: "Clean, typography-driven layout perfect for developers.",
    isPro: false,
    previewable: true,
    mockup: "minimal",
  },
  {
    id: "cura-futuri",
    name: "Cura Futuri",
    description: "Dark editorial SPA — high contrast, GSAP motion, gallery lightbox.",
    isPro: true,
    previewable: true,
    mockup: "cura",
  },
  {
    id: "sierra-montana",
    name: "Sierra Montana",
    description: "Multi-page storytelling with smooth scroll and cinematic project pages.",
    isPro: true,
    previewable: true,
    mockup: "sierra",
  },
  {
    id: "nico-palmer",
    name: "Nico Palmer",
    description: "Cream canvas, Rader display type, sticky story beats and Lenis scroll.",
    isPro: true,
    previewable: true,
    mockup: "nico",
  },
];

export const PREMIUM_TEMPLATE_IDS = PORTFOLIO_TEMPLATES.filter((t) => t.isPro).map((t) => t.id);

export const BUNDLED_PREMIUM_TEMPLATES = new Set(PREMIUM_TEMPLATE_IDS);

export const THEMEABLE_TEMPLATE_IDS = new Set(PORTFOLIO_TEMPLATES.map((t) => t.id));

/** Dashboard / onboarding live preview URL for a template + handle. */
export function getTemplatePreviewUrl(templateId: string, handle: string): string {
  const safeHandle = encodeURIComponent(handle || "portfolio");
  if (templateId === "minimal") {
    // In-app minimal layout (path-based public portfolio)
    return `/${safeHandle}`;
  }
  return `/api/render/${safeHandle}/${encodeURIComponent(templateId)}/`;
}

export function isPremiumTemplate(templateId: string | null | undefined): boolean {
  return !!templateId && BUNDLED_PREMIUM_TEMPLATES.has(templateId);
}
