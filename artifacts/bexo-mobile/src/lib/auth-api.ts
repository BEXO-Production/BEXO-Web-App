import { customFetch } from "@workspace/api-client-react";
import type {
  AchievementEntry,
  CertificateEntry,
  ContactData,
  EducationEntry,
  ExperienceEntry,
  ProjectEntry,
  ResearchEntry,
  SkillEntry,
} from "./profile-api";

/**
 * Profile endpoints aren't in the OpenAPI spec yet (only /healthz is
 * generated today — see lib/api-spec/openapi.yaml), so this calls them
 * directly through the shared `customFetch` for consistent base URL + RN
 * body parsing.
 */

export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  return digits;
}

export interface VerifyOtpResponse {
  accessToken: string;
  hasCompletedOnboarding: boolean;
}

/**
 * Mirrors POST /api/auth/phone/widget-verify (auth.ts) — the MSG91 OTP
 * Widget path. `widgetToken` is the access token the widget's own success
 * callback returns after it has already sent and verified the OTP itself
 * (SMS primary, WhatsApp fallback); we never see the OTP code. Same
 * response shape as the legacy verifyOtp above, so callers barely change.
 */
export async function verifyWidgetToken(widgetToken: string): Promise<VerifyOtpResponse> {
  return customFetch<VerifyOtpResponse>("/api/auth/phone/widget-verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ widgetToken }),
  });
}

export interface BexoUser {
  id: string;
  phone: string;
  /** The identity behind this person's QR — unique, printed on the card. */
  cardCode: string;
  /** The exact string that QR encodes, minted by the server. */
  cardUrl: string;
  name: string | null;
  email: string | null;
  oauthProvider: string | null;
  photoUrl: string | null;
  resumeUrl: string | null;
  uploadedResumeUrl: string | null;
  templateId: string;
  themeColor: string;
  themeBg: string;
  openToHire: boolean;
  autoConnect?: boolean;
  /** Postgres bigints arrive as strings over JSON. */
  storageUsedBytes: number | string;
  storageQuotaBytes: number | string;
}

export interface BexoProfile {
  id: string;
  handle: string | null;
  headline: string | null;
  bio: string | null;
  templateId?: string | null;
  /** Private card-studio preference — see card-design.ts. */
  cardDesign: {
    background: string;
    font: string;
    accent?: string;
    headline?: string;
    photoShape?: string;
    photoUrl?: string | null;
    fields?: Record<string, boolean>;
  };
}

export interface ProfileResponse {
  profile: BexoProfile;
  user: BexoUser;
  plan: string;
  isPremium: boolean;
  siteStatus: string;
  renewalMode: string | null;
  expiresAt: string | null;
  billingPeriod: string | null;
  cancelAtPeriodEnd: boolean;
  autopay: boolean;
  limits: {
    parsesPerMonth: number;
    updatesPerMonth: number;
    updatesUsed: number;
    updatesRemaining: number;
    updatesDaysToReset: number;
    parsesUsed: number;
    parsesRemaining: number;
    parsesDaysToReset: number;
  };
  /** Section entry lists — each a JSON array whose length is the real
   * "N entries" count (see GET /api/profile in profile.ts). */
  aboutEntries: unknown[];
  educationEntries: EducationEntry[];
  experienceEntries: ExperienceEntry[];
  projectEntries: ProjectEntry[];
  certificateEntries: CertificateEntry[];
  achievementEntries: AchievementEntry[];
  researchEntries: ResearchEntry[];
  skillEntries: SkillEntry[];
  contactData: ContactData;
}

export async function fetchProfile(): Promise<ProfileResponse> {
  return customFetch<ProfileResponse>("/api/profile", { method: "GET" });
}
