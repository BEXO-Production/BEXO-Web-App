/**
 * Design tokens mirrored 1:1 from the design canvas
 * (`design_handoff_bexo_mobile_app/BEXO Mobile v2.dc.html`, `:root` + the dark
 * override in `appStyle`). Light and dark are the same token names with
 * different values — never two separate designs.
 */

export type Palette = {
  paper: string;
  panel: string;
  panelStrong: string;
  deep: string;
  bezel: string;
  ink: string;
  muted: string;
  faint: string;
  whisper: string;
  border: string;
  borderStrong: string;
  accent: string;
  accentSoft: string;
  accentWash: string;
  accentEdge: string;
  chrome: string;
  onChrome: string;
  onChromeFaint: string;
  success: string;
  warn: string;
  danger: string;
  cta: string;
  onCta: string;
  desk: string;
};

export const lightColors: Palette = {
  paper: "#F3F1EC",
  panel: "#FFFFFF",
  panelStrong: "#FBFAF7",
  deep: "#E9E6DF",
  bezel: "#F7F5F1",
  ink: "#16171B",
  muted: "rgba(22,23,27,0.60)",
  faint: "rgba(22,23,27,0.38)",
  whisper: "rgba(22,23,27,0.20)",
  border: "rgba(22,23,27,0.10)",
  borderStrong: "rgba(22,23,27,0.20)",
  accent: "#2F6BFF",
  accentSoft: "#2554D6",
  accentWash: "rgba(47,107,255,0.09)",
  accentEdge: "rgba(47,107,255,0.28)",
  chrome: "#101014",
  onChrome: "rgba(255,255,255,0.94)",
  onChromeFaint: "rgba(255,255,255,0.34)",
  success: "#0E9F5D",
  warn: "#B3730A",
  danger: "#D93843",
  cta: "#16171B",
  onCta: "#FFFFFF",
  desk: "#DCD8CF",
};

export const darkColors: Palette = {
  paper: "#05070f",
  panel: "rgba(255,255,255,0.045)",
  panelStrong: "rgba(255,255,255,0.07)",
  deep: "#0b1220",
  bezel: "#070b14",
  ink: "rgba(255,255,255,0.94)",
  muted: "rgba(255,255,255,0.62)",
  faint: "rgba(255,255,255,0.40)",
  whisper: "rgba(255,255,255,0.24)",
  border: "rgba(255,255,255,0.12)",
  borderStrong: "rgba(255,255,255,0.22)",
  accent: "#2F6BFF",
  accentSoft: "#9bb6ff",
  accentWash: "rgba(47,107,255,0.14)",
  accentEdge: "rgba(47,107,255,0.40)",
  chrome: "#0b1220",
  onChrome: "rgba(255,255,255,0.94)",
  onChromeFaint: "rgba(255,255,255,0.34)",
  success: "#3ad48c",
  warn: "#e0a24a",
  danger: "#ff6b73",
  cta: "#2F6BFF",
  onCta: "#FFFFFF",
  desk: "#05070f",
};

/** Fixed brand values that do not flip with the theme. */
export const brand = {
  accent: "#2F6BFF",
  accentBright: "#5B8CFF",
  accentPale: "#7FB0FF",
  accentMist: "#9bb6ff",
  accentDeep: "#17399C",
  whatsapp: "#25D366",
  mint: "#34D399",
  night: "#05070f",
  gradient: ["#5B8CFF", "#2F6BFF"] as const,
} as const;

export type ShadowStyle = {
  shadowColor: string;
  shadowOpacity: number;
  shadowRadius: number;
  shadowOffset: { width: number; height: number };
  elevation: number;
};

/** `--shadowLow / --shadowCard / --shadowFloat`, translated to RN shadow props. */
export const shadows = (dark: boolean): Record<"low" | "card" | "float", ShadowStyle> =>
  dark
    ? {
        low: { shadowColor: "#000", shadowOpacity: 0.45, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
        card: { shadowColor: "#000", shadowOpacity: 0.48, shadowRadius: 34, shadowOffset: { width: 0, height: 16 }, elevation: 8 },
        float: { shadowColor: brand.accent, shadowOpacity: 0.4, shadowRadius: 50, shadowOffset: { width: 0, height: 22 }, elevation: 16 },
      }
    : {
        low: { shadowColor: "#16171B", shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
        card: { shadowColor: "#16171B", shadowOpacity: 0.09, shadowRadius: 24, shadowOffset: { width: 0, height: 10 }, elevation: 5 },
        float: { shadowColor: "#16171B", shadowOpacity: 0.2, shadowRadius: 44, shadowOffset: { width: 0, height: 22 }, elevation: 14 },
      };

/** Screen rhythm from the canvas: 20–22px sides, 58px top, 26–30px bottom. */
export const layout = {
  screenX: 20,
  screenXWide: 22,
  screenTop: 58,
  screenBottom: 30,
  navBarSpace: 110,
} as const;

export const radii = {
  pill: 999,
  input: 14,
  chip: 16,
  card: 22,
  cardLarge: 26,
  sheet: 30,
} as const;

/**
 * Back-compat alias: the light palette. Screens that have not yet been moved to
 * `useTheme()` still import this.
 */
export const colors = lightColors;
