import { fonts } from "./fonts";

/**
 * Card finishes and typefaces — ids and values ported straight from the
 * design canvas's `SKINS`/`CARD_FONTS` arrays, and constrained to exactly
 * what the server's CARD_BACKGROUNDS/CARD_FONTS allow-lists accept (see
 * `parseCardDesign` in api-server/src/routes/profile.ts) so every option
 * the studio offers actually saves.
 */
export interface CardSkin {
  id: string;
  name: string;
  gradient: readonly [string, string, string];
  text: string;
  textMuted: string;
  rule: string;
  /** Ink colour for the QR pattern printed on the back. */
  qr: string;
  /** Only the light "paper" finish needs a hairline edge to sit on white. */
  border?: string;
}

export const CARD_SKINS: CardSkin[] = [
  { id: "forest", name: "Forest", gradient: ["#144D3F", "#0D362C", "#07211B"], text: "#FFFFFF", textMuted: "rgba(255,255,255,0.78)", rule: "#56D8A6", qr: "#0D362C" },
  { id: "electric", name: "Electric", gradient: ["#3D74FF", "#2F6BFF", "#1E48C8"], text: "#F8FBFF", textMuted: "rgba(248,251,255,0.78)", rule: "#A5C4FF", qr: "#16171B" },
  { id: "ink", name: "Ink", gradient: ["#2A2B31", "#18191E", "#101114"], text: "#F8F7F3", textMuted: "rgba(248,247,243,0.75)", rule: "#60A5FA", qr: "#16171B" },
  { id: "paper", name: "Paper", gradient: ["#FFFFFF", "#F4F2ED", "#EAE7E0"], text: "#16171B", textMuted: "rgba(22,23,27,0.70)", rule: "#0D9488", qr: "#16171B", border: "rgba(22,23,27,0.14)" },
  { id: "midnight", name: "Midnight", gradient: ["#1C2E64", "#14204A", "#0B1128"], text: "#F6F8FF", textMuted: "rgba(246,248,255,0.75)", rule: "#7DD3FC", qr: "#14204A" },
  { id: "clay", name: "Clay", gradient: ["#A8553F", "#873F30", "#652C23"], text: "#FFF8F5", textMuted: "rgba(255,248,245,0.78)", rule: "#FFC4B0", qr: "#4A211A" },
  { id: "champagne", name: "Gold", gradient: ["#D4AF37", "#AA7C11", "#5C4004"], text: "#FFFDF8", textMuted: "rgba(255,253,248,0.80)", rule: "#FFE699", qr: "#3B2A06" },
  { id: "rose", name: "Rose", gradient: ["#C0392B", "#962D22", "#5B1A13"], text: "#FFF5F5", textMuted: "rgba(255,245,245,0.78)", rule: "#FFB8B8", qr: "#4A140E" },
  { id: "violet", name: "Violet", gradient: ["#8E44AD", "#6C3483", "#4A235A"], text: "#FAEDFF", textMuted: "rgba(250,237,255,0.78)", rule: "#E9D5FF", qr: "#32143E" },
  { id: "titanium", name: "Titanium", gradient: ["#57606F", "#2F3542", "#1E272E"], text: "#F5F6FA", textMuted: "rgba(245,246,250,0.75)", rule: "#70A1FF", qr: "#1E272E" },
];

export interface CardFont {
  id: string;
  name: string;
  family: string;
  letterSpacing: number;
}

/** Same three underlying families as the rest of the app (see fonts.ts) —
 * the design's 5 "typefaces" differ only in weight/letter-spacing, which
 * RN's `letterSpacing` style already covers with no extra font files. */
export const CARD_FONTS: CardFont[] = [
  { id: "jakarta", name: "Jakarta", family: fonts.sans800, letterSpacing: 0.5 },
  { id: "editorial", name: "Editorial", family: fonts.serif600, letterSpacing: 0.2 },
  { id: "mono", name: "Mono", family: fonts.mono700, letterSpacing: 1 },
  { id: "outfit", name: "Outfit", family: fonts.sans800, letterSpacing: 2 },
  { id: "space", name: "Space", family: fonts.mono500, letterSpacing: 0.6 },
];

export const DEFAULT_SKIN_ID = "forest";
export const DEFAULT_FONT_ID = "jakarta";

export function findSkin(id: string | undefined): CardSkin {
  return CARD_SKINS.find((s) => s.id === id) ?? CARD_SKINS[0];
}

export function findFont(id: string | undefined): CardFont {
  return CARD_FONTS.find((f) => f.id === id) ?? CARD_FONTS[0];
}
