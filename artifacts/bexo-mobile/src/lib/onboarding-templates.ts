/** Shared with app/(app)/portfolio.tsx — kept here too since the wizard needs it before
 * a profile exists. Mirrors SITE_TEMPLATES in the design canvas. */
export const ONBOARDING_TEMPLATES = [
  { id: "minimal", name: "Minimal", tag: "Free · clean canvas", dark: false },
  { id: "cura-futuri", name: "Cura Futuri", tag: "Dark editorial", dark: true },
  { id: "sierra-montana", name: "Sierra Montana", tag: "Cinematic pages", dark: true },
  { id: "nico-palmer", name: "Nico Palmer", tag: "Cream canvas", dark: false },
] as const;
