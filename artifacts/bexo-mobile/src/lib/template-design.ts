/**
 * Design tokens lifted verbatim from the three shipping templates in
 * `BEXO-Premium-Templates`, so the phone previews what the subdomain will
 * actually serve.
 *
 *   Cura Futuri    → Modern Template-1/cura-futuri  (src/index.css, src/utils/theme.js)
 *   Sierra Montana → Modern Template-2              (css/styles.css, js/theme.js)
 *   Nico Palmer    → Modern Template-3/nico-palmer  (src/index.css, src/utils/theme.js)
 *
 * The important subtlety, and the reason this file exists rather than a few
 * hex literals inline: **each template re-tunes the platform accent for its
 * own canvas.** Picking "Navy" does not paint #2563EB on the live site — it
 * paints rgb(122,162,247) on Cura Futuri's near-black, and rgb(55,90,150) on
 * Nico Palmer's cream. Showing the raw swatch colour in the preview is a lie
 * the user only discovers after publishing.
 *
 * Fonts are named here for reference; the phone substitutes its own loaded
 * families (see FONT_ROLE below) because the templates ship licensed OTFs
 * (Rosseta, Wremena, Canopee, Acid Grotesk, Rader, Messina Sans) that are not
 * bundled into the app.
 */

import { fonts } from "@/lib/fonts";

export type TemplateId = "cura-futuri" | "sierra-montana" | "nico-palmer";

/** The accent ids the templates actually implement in their THEME_PALETTES. */
export type TemplateAccentId = "blue" | "emerald" | "rose" | "violet" | "gold";

export interface TemplateDesign {
  id: TemplateId;
  name: string;
  /** Whether the canvas is dark — drives every contrast decision downstream. */
  dark: boolean;
  /** Page background. */
  canvas: string;
  /** Slightly raised panels. */
  surface: string;
  /** Borders and hairlines. */
  hairline: string;
  /** Primary and secondary type colours. */
  fg: string;
  fgMuted: string;
  fgFaint: string;
  /** Per-accent hex, already re-tuned by the template for this canvas. */
  accents: Record<TemplateAccentId, string>;
  /** Text colour the template puts *on* a filled accent block. */
  onAccent: string;
  /** The background texture the template looks best in, when the user has
   *  expressed no preference. */
  signatureBackground: "grid" | "dots" | "waves" | "solid";
  /** Real typeface names, for the credit line under each template. */
  typefaces: { display: string; body: string };
}

const rgb = (triplet: string) => {
  const [r, g, b] = triplet.split(",").map((n) => Number(n.trim()));
  return `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
};

export const TEMPLATE_DESIGN: Record<TemplateId, TemplateDesign> = {
  /* Modern Template-1 — near-black editorial. index.css :root */
  "cura-futuri": {
    id: "cura-futuri",
    name: "Cura Futuri",
    dark: true,
    canvas: "#0d0d11",
    surface: "#131317",
    hairline: "rgba(255,255,255,0.10)",
    fg: "#ffffff",
    fgMuted: "rgba(255,255,255,0.62)",
    fgFaint: "#4a4a51",
    // theme.js THEME_PALETTES — brightened to carry on near-black.
    accents: {
      blue: rgb("122, 162, 247"),
      emerald: rgb("111, 209, 167"),
      rose: rgb("242, 158, 174"),
      violet: rgb("183, 157, 245"),
      gold: rgb("212, 175, 120"),
    },
    onAccent: "#141210",
    signatureBackground: "grid",
    typefaces: { display: "Rosseta", body: "Wremena" },
  },

  /* Modern Template-2 — warm cream, editorial serif. css/styles.css :root */
  "sierra-montana": {
    id: "sierra-montana",
    name: "Sierra Montana",
    dark: false,
    canvas: "#e4e3db",
    surface: "rgba(10,10,10,0.04)",
    hairline: "rgba(10,10,10,0.12)",
    fg: "#0a0a0a",
    fgMuted: "rgba(10,10,10,0.62)",
    fgFaint: "rgba(10,10,10,0.38)",
    // js/theme.js THEME_PALETTES — deepened to hold on cream.
    accents: {
      blue: rgb("70, 110, 180"),
      emerald: rgb("60, 130, 100"),
      rose: rgb("180, 90, 100"),
      violet: rgb("120, 90, 160"),
      gold: rgb("200, 140, 70"),
    },
    onAccent: "#e4e3db",
    signatureBackground: "dots",
    typefaces: { display: "Canopee", body: "Acid Grotesk" },
  },

  /* Modern Template-3 — cream canvas, hairline display type. index.css :root */
  "nico-palmer": {
    id: "nico-palmer",
    name: "Nico Palmer",
    dark: false,
    canvas: "#e3e3db",
    surface: "rgba(227,227,219,0.25)",
    hairline: "rgba(15,15,15,0.12)",
    fg: "#0f0f0f",
    fgMuted: "rgba(31,31,31,0.66)",
    fgFaint: "rgba(15,15,15,0.40)",
    // src/utils/theme.js THEME_PALETTES — the deepest set of the three.
    accents: {
      blue: rgb("55, 90, 150"),
      emerald: rgb("45, 110, 85"),
      rose: rgb("160, 70, 85"),
      violet: rgb("100, 75, 145"),
      gold: rgb("170, 120, 55"),
    },
    onAccent: "#e3e3db",
    signatureBackground: "waves",
    typefaces: { display: "Rader", body: "Messina Sans" },
  },
};

export const TEMPLATE_IDS = Object.keys(TEMPLATE_DESIGN) as TemplateId[];

export function templateDesign(id: string): TemplateDesign {
  return TEMPLATE_DESIGN[id as TemplateId] ?? TEMPLATE_DESIGN["nico-palmer"];
}

/**
 * The colour a given template will actually paint for a platform accent id.
 * Anything the templates do not implement falls back to `gold`, exactly as
 * their own `getThemePalette()` does.
 */
export function templateAccent(templateId: string, colorId: string): string {
  const design = templateDesign(templateId);
  return design.accents[colorId as TemplateAccentId] ?? design.accents.gold;
}

/**
 * Stand-ins for the templates' licensed typefaces, mapped by the *role* each
 * plays rather than by name — Cura's display face is a heavy uppercase
 * serif, Nico's is a hairline geometric, and the phone's own families are
 * chosen to read the same way at a glance.
 */
export const FONT_ROLE: Record<TemplateId, { display: string; body: string; label: string }> = {
  "cura-futuri": { display: fonts.serif600, body: fonts.sans400, label: fonts.sans600 },
  "sierra-montana": { display: fonts.serif600, body: fonts.sans400, label: fonts.mono500 },
  "nico-palmer": { display: fonts.sans800, body: fonts.sans400, label: fonts.mono500 },
};
