import { billingProfiles, db } from "@workspace/db";
import { eq } from "drizzle-orm";

export type BillingProfileInput = {
  fullName: string;
  email: string;
  phone: string;
  line1: string;
  line2?: string | null;
  city: string;
  state: string;
  postalCode: string;
  country?: string | null;
};

export type BillingProfileRow = typeof billingProfiles.$inferSelect;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cleanText(value: unknown, max: number): string {
  return String(value ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function normalizePhone(value: unknown): string {
  const raw = String(value ?? "").trim();
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  if (raw.startsWith("+") && digits.length >= 10 && digits.length <= 15) return `+${digits}`;
  return digits ? `+${digits}` : "";
}

export function validateBillingProfile(input: unknown):
  | { ok: true; value: BillingProfileInput }
  | { ok: false; error: string } {
  if (!input || typeof input !== "object") {
    return { ok: false, error: "Billing information is required." };
  }
  const body = input as Record<string, unknown>;
  const fullName = cleanText(body.fullName ?? body.name, 120);
  const email = cleanText(body.email, 254).toLowerCase();
  const phone = normalizePhone(body.phone);
  const line1 = cleanText(body.line1 ?? body.addressLine1, 120);
  const line2 = cleanText(body.line2 ?? body.addressLine2, 120) || null;
  const city = cleanText(body.city, 80);
  const state = cleanText(body.state, 80);
  const postalCode = cleanText(body.postalCode ?? body.pincode ?? body.zip, 16).replace(/\s+/g, "");
  const country = (cleanText(body.country, 2).toUpperCase() || "IN").slice(0, 2);

  if (fullName.length < 2) return { ok: false, error: "Enter the billing name." };
  if (!EMAIL_RE.test(email)) return { ok: false, error: "Enter a valid billing email." };
  if (!/^\+91\d{10}$/.test(phone) && !/^\+\d{10,15}$/.test(phone)) {
    return { ok: false, error: "Enter a valid billing phone number." };
  }
  if (line1.length < 3) return { ok: false, error: "Enter billing address line 1." };
  if (city.length < 2) return { ok: false, error: "Enter the city." };
  if (state.length < 2) return { ok: false, error: "Enter the state." };
  if (!/^[1-9][0-9]{5}$/.test(postalCode) && country === "IN") {
    return { ok: false, error: "Enter a valid 6-digit PIN code." };
  }
  if (!postalCode) return { ok: false, error: "Enter the postal / PIN code." };

  return {
    ok: true,
    value: { fullName, email, phone, line1, line2, city, state, postalCode, country },
  };
}

export function formatBillingAddressLines(profile: {
  line1: string;
  line2?: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}): string[] {
  const lines = [profile.line1];
  if (profile.line2) lines.push(profile.line2);
  lines.push(`${profile.city} ${profile.postalCode}`.trim());
  lines.push(`${profile.state}`);
  lines.push(profile.country || "IN");
  return lines;
}

export async function getBillingProfile(userId: string): Promise<BillingProfileRow | null> {
  const [row] = await db.select().from(billingProfiles).where(eq(billingProfiles.userId, userId)).limit(1);
  return row || null;
}

export async function upsertBillingProfile(
  userId: string,
  input: BillingProfileInput,
): Promise<BillingProfileRow> {
  const values = {
    userId,
    fullName: input.fullName,
    email: input.email,
    phone: input.phone,
    line1: input.line1,
    line2: input.line2 || null,
    city: input.city,
    state: input.state,
    postalCode: input.postalCode,
    country: input.country || "IN",
    updatedAt: new Date(),
  };

  const [row] = await db
    .insert(billingProfiles)
    .values(values)
    .onConflictDoUpdate({
      target: billingProfiles.userId,
      set: {
        fullName: values.fullName,
        email: values.email,
        phone: values.phone,
        line1: values.line1,
        line2: values.line2,
        city: values.city,
        state: values.state,
        postalCode: values.postalCode,
        country: values.country,
        updatedAt: values.updatedAt,
      },
    })
    .returning();

  return row;
}

export function toPublicBillingProfile(row: BillingProfileRow | null) {
  if (!row) return null;
  return {
    fullName: row.fullName,
    email: row.email,
    phone: row.phone,
    line1: row.line1,
    line2: row.line2,
    city: row.city,
    state: row.state,
    postalCode: row.postalCode,
    country: row.country,
    addressLines: formatBillingAddressLines(row),
    updatedAt: row.updatedAt,
  };
}

/**
 * Checkout gate: upsert from request body when provided, otherwise reuse the
 * saved profile. Never opens Razorpay without a validated billing identity.
 */
export async function ensureBillingProfileForCheckout(
  userId: string,
  bodyBilling: unknown,
): Promise<{ ok: true; profile: BillingProfileRow } | { ok: false; error: string; code: string }> {
  const hasPayload =
    bodyBilling != null &&
    typeof bodyBilling === "object" &&
    Object.keys(bodyBilling as object).length > 0;

  if (hasPayload) {
    const validated = validateBillingProfile(bodyBilling);
    if (!validated.ok) {
      return { ok: false, error: validated.error, code: "BILLING_INVALID" };
    }
    const profile = await upsertBillingProfile(userId, validated.value);
    return { ok: true, profile };
  }

  const existing = await getBillingProfile(userId);
  if (!existing) {
    return {
      ok: false,
      error: "Add your billing information before paying.",
      code: "BILLING_REQUIRED",
    };
  }
  return { ok: true, profile: existing };
}
