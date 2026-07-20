/** Canonical BEXO portfolio template catalog (onboarding + dashboard). */
export type PortfolioTemplate = {
  id: string;
  name: string;
  description: string;
  isPro: boolean;
  /** Live iframe preview available via /api/render/:handle/:id */
  previewable: boolean;
  /** Visual family for thumbnail mockups */
  mockup: "cura" | "sierra" | "nico";
};

/** Reserved fictional handle for marketing / onboarding / picker previews — never a real user */
export const MARKETING_DEMO_HANDLE = "bexo-demo";

/**
 * Free-plan server fallback only — never shown in the UI template picker.
 * Free users publish on path URLs; Pro templates require an active plan.
 */
export const FREE_FALLBACK_TEMPLATE_ID = "minimal";

/** Default Pro layout when a user has no selection yet */
export const DEFAULT_TEMPLATE_ID = "cura-futuri";

/** Premium layouts only — Minimal is not selectable anywhere in the product UI. */
export const PORTFOLIO_TEMPLATES: PortfolioTemplate[] = [
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

/**
 * Templates shown in pickers.
 * Premium users never see free/Minimal. Free users only see Pro layouts (locked until upgrade).
 */
export function getSelectableTemplates(_isPremium?: boolean): PortfolioTemplate[] {
  return PORTFOLIO_TEMPLATES.filter((t) => t.isPro);
}

/** Demo portfolio preview — used across onboarding + dashboard template browsing. */
export function getDemoPreviewUrl(templateId: string): string {
  const id = templateId && templateId !== FREE_FALLBACK_TEMPLATE_ID
    ? templateId
    : DEFAULT_TEMPLATE_ID;
  return `/api/render/${encodeURIComponent(MARKETING_DEMO_HANDLE)}/${encodeURIComponent(id)}/`;
}

/**
 * Live preview for a specific handle + template.
 * Free/Minimal falls back to the demo Pro layout so pickers never 404 on path URLs.
 */
export function getTemplatePreviewUrl(templateId: string, handle?: string | null): string {
  const id =
    !templateId || templateId === FREE_FALLBACK_TEMPLATE_ID
      ? DEFAULT_TEMPLATE_ID
      : templateId;

  if (!handle || handle === MARKETING_DEMO_HANDLE) {
    return getDemoPreviewUrl(id);
  }

  return `/api/render/${encodeURIComponent(handle)}/${encodeURIComponent(id)}/`;
}

export function isPremiumTemplate(templateId: string | null | undefined): boolean {
  return !!templateId && BUNDLED_PREMIUM_TEMPLATES.has(templateId);
}

export function normalizeSelectableTemplateId(
  templateId: string | null | undefined,
  isPremium: boolean,
): string {
  if (isPremium && isPremiumTemplate(templateId)) return templateId as string;
  if (isPremium) return DEFAULT_TEMPLATE_ID;
  // Free users keep server fallback; UI never selects Minimal explicitly.
  return FREE_FALLBACK_TEMPLATE_ID;
}
