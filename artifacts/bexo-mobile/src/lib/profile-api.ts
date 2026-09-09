import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { apiUrl } from "./api-client";
import { getAccessToken } from "./storage";
import type { ProfileResponse } from "./auth-api";

/** Mirrors PATCH /api/profile (artifacts/api-server/src/routes/profile.ts).
 * Every `*Entries` field replaces that section's entire list — the server
 * diffs against what's already saved by `id` to count "net new" entries for
 * the monthly-update credit gate, so an edit must resend the full array
 * (existing entries + any changes), never just the one row that changed. */
export interface ProfilePatch {
  name?: string;
  dob?: string;
  handle?: string;
  headline?: string;
  bio?: string;
  templateId?: string;
  themeColor?: string;
  themeBg?: string;
  openToHire?: boolean;
  autoConnect?: boolean;
  photoUrl?: string;
  cardDesign?: {
    background: string;
    font: string;
    accent?: string;
    headline?: string;
    photoShape?: string;
    photoUrl?: string | null;
    fields?: Record<string, boolean>;
  };
  educationEntries?: EducationEntry[];
  experienceEntries?: ExperienceEntry[];
  projectEntries?: ProjectEntry[];
  certificateEntries?: CertificateEntry[];
  achievementEntries?: AchievementEntry[];
  researchEntries?: ResearchEntry[];
  skillEntries?: SkillEntry[];
  contactData?: ContactData;
}

/** Field shapes mirror bexo-web's editor (step-6.tsx) exactly — same server,
 * same stored JSON, so mobile has to write the same keys web does. */
export interface EducationEntry {
  id: string;
  institution: string;
  degree: string;
  startYear: string;
  /** "Present" is the literal sentinel value for an ongoing entry. */
  endYear: string;
  grade: string;
}

export interface ExperienceEntry {
  id: string;
  company: string;
  role: string;
  startYear: string;
  endYear: string;
  description: string;
}

export interface ProjectEntry {
  id: string;
  title: string;
  description: string;
  tech: string;
}

export interface CertificateEntry {
  id: string;
  title: string;
  issuer: string;
  date: string;
}

export interface AchievementEntry {
  id: string;
  title: string;
  organization: string;
  date: string;
}

export interface ResearchEntry {
  id: string;
  title: string;
  organization: string;
  date: string;
}

export interface SkillEntry {
  id: string;
  name: string;
  category: "technical" | "tools" | "soft" | "languages";
}

export interface ContactData {
  email: string;
  phone: string;
  linkedin: string;
  github: string;
  portfolio: string;
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: ProfilePatch) =>
      customFetch<{ success: boolean; message?: string }>("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
  });
}

export function useCheckHandle(handle: string) {
  return useQuery({
    queryKey: ["check-handle", handle],
    queryFn: () =>
      customFetch<{ available: boolean; reason?: string }>(
        `/api/profile/check-handle?handle=${encodeURIComponent(handle)}`,
        { method: "GET" },
      ),
    enabled: handle.trim().length >= 3,
    staleTime: 0,
  });
}

export async function suggestHandle(firstName: string, lastName: string): Promise<string> {
  const params = new URLSearchParams({ firstName, lastName });
  const res = await customFetch<{ suggestedHandle: string }>(
    `/api/profile/suggest-handle?${params.toString()}`,
    { method: "GET" },
  );
  return res.suggestedHandle;
}

/** Mirrors POST /api/profile/resume (multipart) and GET /api/profile/resume/status/:attemptId.
 * `data` — present only once `status` is "succeeded" — is the raw AI extraction
 * (see `resumeParseQueue.ts`): arrays of loosely-shaped section entries, plus
 * `skills`, none of them carrying an `id` yet (the caller assigns one when it
 * merges them into a section). */
export interface ParsedResumeData {
  education: Array<{ institution?: string; degree?: string; startYear?: string; endYear?: string; grade?: string }>;
  experience: Array<{ company?: string; role?: string; startYear?: string; endYear?: string; description?: string }>;
  projects: Array<{ title?: string; description?: string; tech?: string }>;
  certificates: Array<{ title?: string; issuer?: string; date?: string }>;
  skills: Array<{ name: string; category: SkillEntry["category"] }>;
}

export interface ResumeUploadResult {
  status: "succeeded" | "queued" | "processing" | "failed";
  attemptId?: string;
  data?: ParsedResumeData | null;
  resumeUrl?: string;
  cached?: boolean;
  error?: string;
  retryAfterMs?: number;
}

export async function uploadResume(file: {
  uri: string;
  name: string;
  mimeType: string;
}): Promise<ResumeUploadResult> {
  const token = await getAccessToken();
  const form = new FormData();
  // React Native's fetch/FormData accepts this shape (not a real Blob) for file uploads.
  form.append("resume", {
    uri: file.uri,
    name: file.name,
    type: file.mimeType,
  } as unknown as Blob);

  const res = await fetch(apiUrl("/api/profile/resume"), {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: form,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || "Failed to upload resume");
  }
  return data;
}

export async function getResumeParseStatus(attemptId: string): Promise<ResumeUploadResult> {
  return customFetch<ResumeUploadResult>(`/api/profile/resume/status/${attemptId}`, {
    method: "GET",
  });
}

/** Mirrors POST /api/profile/link-google (routes/profile.ts) — links a Google
 * identity's email onto the already phone-verified BEXO account. Requires
 * requireAuth server-side, i.e. the caller must already hold a BEXO JWT from
 * phone verification — Google is a link, not an independent sign-in. */
export interface LinkGoogleResponse {
  success: true;
  user: { id: string; email: string; oauthProvider: "google"; oauthId: string; name: string | null; photoUrl: string | null };
}

export async function linkGoogleAccount(supabaseAccessToken: string): Promise<LinkGoogleResponse> {
  return customFetch<LinkGoogleResponse>("/api/profile/link-google", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accessToken: supabaseAccessToken }),
  });
}

/** Mirrors POST /api/profile/upload (generic asset upload, e.g. profile photo). */
export async function uploadFile(file: {
  uri: string;
  name: string;
  mimeType: string;
}): Promise<{ url: string }> {
  const token = await getAccessToken();
  const form = new FormData();
  form.append("file", { uri: file.uri, name: file.name, type: file.mimeType } as unknown as Blob);

  const res = await fetch(apiUrl("/api/profile/upload"), {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || "Failed to upload file");
  return data;
}

/** Mirrors GET /api/profile/assets — every uploaded file, for the real storage breakdown. */
export interface ProfileAsset {
  id: string;
  name: string;
  url: string;
  sizeBytes: number;
  sectionType: string | null;
  createdAt: string;
}

export interface AssetsResponse {
  assets: ProfileAsset[];
  storageUsedBytes: number;
  storageQuotaBytes: number;
}

export function useAssets() {
  return useQuery({
    queryKey: ["assets"],
    queryFn: () => customFetch<AssetsResponse>("/api/profile/assets", { method: "GET" }),
  });
}
