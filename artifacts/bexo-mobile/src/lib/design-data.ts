import type { Feather } from "@expo/vector-icons";
import type { ProfileResponse } from "@/lib/auth-api";

type Icon = keyof typeof Feather.glyphMap;

/**
 * Content the design canvas ships as fixed copy — plans, review sections, the
 * coach tour, card headline presets, site theming options and the demo
 * enquiries/notifications/analytics used wherever the API has nothing to say
 * yet. Values are verbatim from `BEXO Mobile v2.dc.html`.
 */

/* ── card back headlines & presets ─────────────────────────────────────── */

export interface BackHeadline {
  id: string;
  pre: string;
  accent: string;
  post: string;
}

export const BACK_HEADLINES: BackHeadline[] = [
  { id: "network", pre: "Your Network.", accent: "Smarter", post: "Than Ever." },
  { id: "connect", pre: "Let’s Connect,", accent: "Instantly", post: "." },
  { id: "story", pre: "One Scan.", accent: "Endless", post: "Possibilities." },
  { id: "work", pre: "Let’s Build", accent: "Something", post: "Great." },
];

export const CARD_ACCENTS = [
  { id: "auto", name: "Signature", hex: null as string | null },
  { id: "emerald", name: "Emerald", hex: "#4ADE80" },
  { id: "sky", name: "Sky", hex: "#7DD3FC" },
  { id: "amber", name: "Amber", hex: "#FBBF24" },
  { id: "rose", name: "Rose", hex: "#FB7185" },
  { id: "violet", name: "Violet", hex: "#C4B5FD" },
];

export const CARD_PRESETS = [
  { id: "signature", name: "Signature", desc: "Forest + bold sans, the classic", skin: "forest", font: "jakarta", accent: "auto" },
  { id: "editorial", name: "Editorial", desc: "Ink + serif + signature accent", skin: "ink", font: "editorial", accent: "auto" },
  { id: "signal", name: "Signal", desc: "Electric blue + bold sans", skin: "electric", font: "jakarta", accent: "auto" },
  { id: "minimal", name: "Minimal", desc: "Paper + mono, quiet & clean", skin: "paper", font: "mono", accent: "emerald" },
  { id: "nocturne", name: "Nocturne", desc: "Midnight + geometric sans", skin: "midnight", font: "space", accent: "auto" },
  { id: "gilded", name: "Gilded", desc: "Gold + confident serif", skin: "champagne", font: "editorial", accent: "auto" },
];

/**
 * How the card's picture is cut. A BEXO card is not always a person — a studio
 * or a small business puts a logo here — so the portrait circle is only the
 * default, not the only option.
 */
export const CARD_PHOTO_SHAPES = [
  { id: "circle", label: "Circle" },
  { id: "squircle", label: "Squircle" },
  { id: "rounded", label: "Rounded" },
  { id: "square", label: "Square" },
  { id: "arch", label: "Arch" },
  { id: "hexagon", label: "Hexagon" },
] as const;

export type CardPhotoShape = (typeof CARD_PHOTO_SHAPES)[number]["id"];

/** Corner radii per shape, as a fraction of the photo's size. */
export function photoRadii(shape: CardPhotoShape, size: number) {
  switch (shape) {
    case "square":
      return { topLeft: size * 0.06, topRight: size * 0.06, bottomLeft: size * 0.06, bottomRight: size * 0.06 };
    case "rounded":
      return { topLeft: size * 0.22, topRight: size * 0.22, bottomLeft: size * 0.22, bottomRight: size * 0.22 };
    case "squircle":
      return { topLeft: size * 0.34, topRight: size * 0.34, bottomLeft: size * 0.34, bottomRight: size * 0.34 };
    case "arch":
      return { topLeft: size / 2, topRight: size / 2, bottomLeft: size * 0.14, bottomRight: size * 0.14 };
    case "hexagon":
    case "circle":
    default:
      return { topLeft: size / 2, topRight: size / 2, bottomLeft: size / 2, bottomRight: size / 2 };
  }
}

/** Which fields are printed on the card. Defaults match the canvas state. */
export type CardFields = {
  role: boolean;
  company: boolean;
  rule: boolean;
  photo: boolean;
  tagline: boolean;
  nfc: boolean;
  backCredit: boolean;
  contactSite: boolean;
  contactEmail: boolean;
  contactPhone: boolean;
  contactLocation: boolean;
};

export const DEFAULT_CARD_FIELDS: CardFields = {
  role: true,
  company: true,
  rule: true,
  photo: true,
  tagline: true,
  nfc: true,
  backCredit: true,
  contactSite: true,
  contactEmail: false,
  contactPhone: true,
  contactLocation: false,
};

export const CARD_FIELD_ROWS: { key: keyof CardFields; label: string }[] = [
  { key: "role", label: "Professional title" },
  { key: "company", label: "Company and city" },
  { key: "tagline", label: "Tagline footer" },
  { key: "rule", label: "Accent rule" },
  { key: "contactSite", label: "Show website" },
  { key: "contactEmail", label: "Show email" },
  { key: "contactPhone", label: "Show phone" },
  { key: "contactLocation", label: "Show location" },
  { key: "nfc", label: "Tap-to-connect prompt (back)" },
  { key: "backCredit", label: "Credit line (back)" },
];

/** Card geometry on Home and inside Card Studio. */
export const HOME_DIMS = {
  w: 356, h: 240, radius: 26, pad: 26, gap: 16,
  wordmark: 12.5, mark: 22, ruleW: 30, midGap: 18, name: 21, nameLh: 25, role: 13, sub: 11.5, photo: 72,
  contactGap: 14, contactSize: 11, dotGap: 8, tagline: 10,
  headline: 20, headlineLh: 24, nfc: 12.5, backFooter: 10,
  qrPx: 92, qrWrap: 100, qrRadius: 15, qrPad: 9, qrBadge: 32,
} as const;

export const STUDIO_DIMS = {
  w: 300, h: 202, radius: 22, pad: 21, gap: 13,
  wordmark: 10.5, mark: 18, ruleW: 24, midGap: 14, name: 17.5, nameLh: 21, role: 11, sub: 9.5, photo: 60,
  contactGap: 11, contactSize: 9.3, dotGap: 6, tagline: 8.5,
  headline: 16.5, headlineLh: 20, nfc: 10.5, backFooter: 8.5,
  qrPx: 78, qrWrap: 84, qrRadius: 13, qrPad: 8, qrBadge: 26,
} as const;

export type CardDims = typeof HOME_DIMS | typeof STUDIO_DIMS;

/* ── website theming ───────────────────────────────────────────────────── */

export const SITE_TEMPLATES = [
  {
    id: "cura-futuri",
    name: "Cura Futuri",
    tag: "Dark editorial",
    note: "Dark editorial single page — high contrast, motion, gallery lightbox.",
    image: require("../../assets/brand/templates.jpg"),
    dark: true,
    serif: true,
  },
  {
    id: "sierra-montana",
    name: "Sierra Montana",
    tag: "Cinematic pages",
    note: "Multi-page storytelling with smooth scroll and cinematic project pages.",
    image: require("../../assets/brand/hero-poster.jpg"),
    dark: true,
    serif: false,
  },
  {
    id: "nico-palmer",
    name: "Nico Palmer",
    tag: "Cream canvas",
    note: "Cream canvas, large display type, sticky story beats.",
    image: require("../../assets/brand/publish.jpg"),
    dark: false,
    serif: true,
  },
] as const;

export const SITE_COLORS = [
  { id: "blue", label: "Navy", hex: "#2563EB" },
  { id: "emerald", label: "Emerald", hex: "#059669" },
  { id: "rose", label: "Rose", hex: "#E11D48" },
  { id: "violet", label: "Violet", hex: "#7C3AED" },
  { id: "amber", label: "Amber", hex: "#F59E0B" },
  { id: "sky", label: "Sky", hex: "#0284C7" },
];

export const SITE_BACKGROUNDS = [
  { id: "grid", label: "Clean Grid", description: "Subtle blueprint canvas" },
  { id: "dots", label: "Minimalist Dots", description: "Clean dot matrix overlay" },
  { id: "waves", label: "Abstract Waves", description: "Soft vector wave curves" },
  { id: "solid", label: "Accent Gradient", description: "Vibrant colour blend" },
];

export const SITE_FONT_IDS = [
  { id: "display", name: "Playfair" },
  { id: "grotesk", name: "Space Grotesk" },
  { id: "jakarta", name: "Jakarta" },
];

/* ── wizard ────────────────────────────────────────────────────────────── */

export const WIZARD_STEPS: Record<
  number,
  { label: string; hint: string; cta: string; image?: number }
> = {
  2: { label: "Link email", hint: "Optional, but it makes password-free sign-in and recovery much easier.", cta: "Continue" },
  3: { label: "Name and handle", hint: "Your handle becomes your public address, so choose one you would put on a CV.", cta: "Continue" },
  4: { label: "Profile photo", hint: "A real face reads as a real person. You can change it any time.", cta: "Continue" },
  5: { label: "Resume", hint: "We read it once to fill your sections. You always review before anything is published.", cta: "Continue", image: require("../../assets/brand/resume.jpg") },
  6: { label: "Review sections", hint: "Nothing goes live until you have checked it. Confirm one section at a time.", cta: "Looks right" },
  7: { label: "Template and theme", hint: "Three premium layouts. You can switch any time from the Website tab.", cta: "Continue", image: require("../../assets/brand/templates.jpg") },
  8: { label: "Publish", hint: "", cta: "Publish my portfolio", image: require("../../assets/brand/publish.jpg") },
  9: { label: "Choose a plan", hint: "", cta: "Start with Premium" },
};

export interface ReviewEntry {
  title: string;
  detail: string;
  date?: string;
}

export interface ReviewSection {
  name: string;
  icon: Icon;
  entries: ReviewEntry[];
}

export const REVIEW_SECTIONS: ReviewSection[] = [
  {
    name: "About",
    icon: "user",
    entries: [
      { title: "Headline", detail: "Founder & Managing Director at Ace Digital" },
      { title: "Summary", detail: "Builds digital products for education and small business, based in Coimbatore." },
    ],
  },
  {
    name: "Education",
    icon: "book-open",
    entries: [
      { title: "B.E. Computer Science", detail: "Kumaraguru College of Technology · 2019 – 2023" },
      { title: "Higher Secondary", detail: "Coimbatore · 2019" },
    ],
  },
  {
    name: "Experience",
    icon: "briefcase",
    entries: [
      { title: "Founder & Managing Director", detail: "Ace Digital · 2023 – present · Coimbatore" },
      { title: "Product Engineer (freelance)", detail: "Independent clients · 2022 – 2023" },
      { title: "Web Development Intern", detail: "Coimbatore studio · 2022" },
    ],
  },
  {
    name: "Projects",
    icon: "folder",
    entries: [
      { title: "BEXO portfolio platform", detail: "Resume-to-portfolio publishing on personal subdomains." },
      { title: "Billing engine", detail: "Autopay mandates, invoices and grace handling." },
      { title: "College placement dashboard", detail: "Student and recruiter views." },
    ],
  },
  {
    name: "Skills",
    icon: "zap",
    entries: [{ title: "14 skills detected", detail: "React · TypeScript · Node · Firebase · Product design · Figma" }],
  },
  {
    name: "Contact",
    icon: "mail",
    entries: [
      { title: "Email", detail: "kavin@acedigital.in" },
      { title: "Phone", detail: "+91 98765 43210 · WhatsApp" },
      { title: "Links", detail: "LinkedIn · GitHub" },
    ],
  },
];

export const PUBLISH_CHECKS: { text: string; icon: Icon; color: string }[] = [
  { text: "Name and handle confirmed", icon: "user", color: "#5B8CFF" },
  { text: "Sections reviewed", icon: "layers", color: "#56D8A6" },
  { text: "Template and theme chosen", icon: "sliders", color: "#F0B94D" },
  { text: "Search indexing enabled on Premium", icon: "search", color: "#C792EA" },
];

export interface Plan {
  id: string;
  name: string;
  price: string;
  per: string;
  tag: string;
  accent: string;
  desc: string;
  featured?: boolean;
  perks: string[];
}

export const PLANS: Plan[] = [
  {
    id: "free", name: "Start free", price: "Free", per: "", tag: "Most students start here", accent: "#8B8D94",
    desc: "Explore templates and prove the flow — no card required.",
    perks: ["One live page on your BEXO link", "Basic template", "Limited storage"],
  },
  {
    id: "identity", name: "Identity", price: "₹59", per: "/month", tag: "", accent: "#5B8CFF",
    desc: "Your name on the web. Share it anywhere.",
    perks: ["yourname.atbexo.com", "Premium portfolio templates", "Room for photos & projects", "Hire Me page for recruiters"],
  },
  {
    id: "essential", name: "Essential", price: "₹199", per: "/month", tag: "Recommended", accent: "#2F6BFF",
    desc: "For active job seekers who update often.", featured: true,
    perks: ["Everything in Identity", "More space for your work", "Refresh your resume more often", "Exclusive template looks"],
  },
  {
    id: "growth", name: "Growth", price: "₹999", per: "/year", tag: "Best yearly value", accent: "#56D8A6",
    desc: "Essential power — one bill, twelve months.",
    perks: ["Everything in Essential", "Pay once, stay live all year", "Ideal through placement season"],
  },
  {
    id: "studentplus", name: "Student+", price: "₹1999", per: "one-time", tag: "Keep your name forever", accent: "#C792EA",
    desc: "Identity benefits, billed once — a lasting link for campus and beyond.",
    perks: ["yourname.atbexo.com for life", "Premium templates + Hire Me", "No monthly renewals"],
  },
];

export const PLAN_CTA_NAMES: Record<string, string> = {
  identity: "Identity",
  essential: "Essential",
  growth: "Growth",
  studentplus: "Student+",
};

/* ── home coach tour ───────────────────────────────────────────────────── */

export interface TourStep {
  title: string;
  body: string;
  hole: { left?: number; top?: number; bottom?: number; width: number; height: number; radius: number };
  cardTop?: number;
  cardBottom?: number;
}

export const TOUR_STEPS: TourStep[] = [
  {
    title: "This is your card",
    body: "Tap it any time to flip to your QR — anyone can scan it to open your portfolio instantly.",
    hole: { left: 15, top: 133, width: 372, height: 264, radius: 26 },
    cardTop: 412,
  },
  {
    title: "Track who's looking",
    body: "Views, weekly traffic, and enquiries — all live, updated the moment someone visits.",
    hole: { left: 16, top: 455, width: 370, height: 88, radius: 24 },
    cardTop: 562,
  },
  {
    title: "Add updates anytime",
    body: "Tap the plus button whenever you want to parse a new resume or post an achievement.",
    hole: { left: 320, top: 696, width: 76, height: 76, radius: 999 },
    cardBottom: 210,
  },
  {
    title: "Everything else lives below",
    body: "Network to see your connections, Scan to trade cards in person, Website to restyle your page, Profile for settings.",
    hole: { left: 0, bottom: 0, width: 402, height: 96, radius: 0 },
    cardBottom: 118,
  },
];

export const LEGAL_TEXT: Record<"terms" | "privacy", { title: string; paras: string[] }> = {
  privacy: {
    title: "Privacy Policy",
    paras: [
      "BEXO collects only what your card needs to work: your name, role, company, contact links, and any resume or photo you choose to add.",
      "We never sell your data or post to your contacts without your action. Card taps and profile views are aggregated for your own analytics only.",
      "You can export or permanently delete your data at any time from Settings — deletion removes your public card within minutes.",
    ],
  },
  terms: {
    title: "Terms of Service",
    paras: [
      "By creating a BEXO card you agree to keep the details on it accurate and to use the platform for genuine professional networking.",
      "You retain ownership of everything you upload. BEXO only displays it on the card and pages you explicitly publish.",
      "We may suspend cards that violate community guidelines (impersonation, spam, or abusive content).",
    ],
  },
};

/* ── profile form options ──────────────────────────────────────────────── */

export const GENDER_OPTIONS = [
  { id: "male", label: "Male" },
  { id: "female", label: "Female" },
  { id: "nonbinary", label: "Non-binary" },
  { id: "unspecified", label: "Prefer not to say" },
];

export const PRONOUN_OPTIONS = [
  { id: "she", label: "She / Her" },
  { id: "he", label: "He / Him" },
  { id: "they", label: "They / Them" },
];

/** The next-step prompt / portfolio fresh reminder, chosen from what this profile needs. */
export function getProfileNudge(data?: ProfileResponse | null): { title: string; body: string } {
  if (!data) {
    return { title: "Keep your portfolio fresh", body: "Post an update or re-parse your latest resume." };
  }
  if (!data.profile?.handle) {
    return { title: "Claim your handle", body: "Pick your address and publish your portfolio." };
  }
  if (!data.user?.photoUrl) {
    return { title: "Add a profile photo", body: "Cards with a face get opened more often." };
  }
  if ((data.projectEntries?.length ?? 0) === 0) {
    return { title: "Add your first project", body: "Projects are what recruiters actually read." };
  }
  if ((data.certificateEntries?.length ?? 0) === 0) {
    return { title: "Add your certificates", body: "Profiles updated this month get more recruiter views." };
  }
  return { title: "Keep your portfolio fresh", body: "Post an update or re-parse your latest resume." };
}
