/**
 * Development/production env health — presence only, never log secret values.
 * Catches silent misconfigs like missing SUPABASE_* (Google link 401).
 */
import { logger } from "./logger";

export type EnvCheck = {
  key: string;
  present: boolean;
  critical: boolean;
  note?: string;
};

const CRITICAL: Array<{ key: string; alts?: string[]; note?: string }> = [
  { key: "DATABASE_URL" },
  { key: "JWT_SECRET" },
  { key: "SUPABASE_URL", alts: ["VITE_SUPABASE_URL"], note: "required for Google link-google" },
  { key: "SUPABASE_ANON_KEY", alts: ["VITE_SUPABASE_ANON_KEY"], note: "required for Google link-google" },
  { key: "MSG91_AUTH_KEY", note: "OTP WhatsApp" },
  { key: "MSG91_INTEGRATED_NUMBER" },
  { key: "MSG91_TEMPLATE_NAME" },
  { key: "RAZORPAY_KEY_ID" },
  { key: "RAZORPAY_KEY_SECRET" },
  { key: "RAZORPAY_WEBHOOK_SECRET", note: "webhook HMAC; falls back to key secret if unset (unsafe)" },
  { key: "R2_ACCOUNT_ID" },
  { key: "R2_ACCESS_KEY_ID" },
  { key: "R2_SECRET_ACCESS_KEY" },
  { key: "R2_BUCKET_NAME" },
  { key: "R2_PUBLIC_URL" },
  { key: "SMTP_HOST" },
  { key: "SMTP_USER" },
  { key: "SMTP_PASS" },
  { key: "FRONTEND_URL", alts: ["WEB_URL"] },
  { key: "PLATFORM_DOMAIN", alts: ["BEXO_PLATFORM_DOMAIN"] },
  {
    key: "AI_PROVIDER_KEY",
    alts: ["GOOGLE_API", "GOOGLE_API_KEY", "GEMINI_API_KEY", "OPENROUTER_API_KEY", "GROK_API_KEY", "Grok_API_KEY"],
    note: "at least one resume AI provider is required",
  },
];

const RECOMMENDED: Array<{ key: string; alts?: string[]; note?: string }> = [
  { key: "ADMIN_URL", note: "staff invite links" },
  { key: "PUBLIC_API_URL", note: "admin platform surface" },
  { key: "MARKETING_URL", alts: ["VITE_MARKETING_ORIGIN"] },
  { key: "CRON_SECRET", alts: ["INTERNAL_JOB_SECRET"], note: "secured daily job route" },
  { key: "SMTP_FROM", note: "defaults to SMTP_USER" },
  { key: "SMTP_FROM_NAME" },
  { key: "ANALYTICS_HASH_SALT", note: "defaults to weak salt" },
  { key: "REDIS_URL", note: "multi-instance OTP; ALLOW_INMEMORY_OTP=1 for single-instance dev" },
  { key: "ALLOW_INMEMORY_OTP", note: "dev escape hatch when REDIS_URL unset" },
  { key: "MSG91_TEMPLATE_NAMESPACE" },
  { key: "MSG91_TEMPLATE_LANGUAGE" },
  { key: "RAZORPAY_PLAN_ID_ANNUAL", note: "legacy fallback; prefer DB pricing_plans.razorpay_plan_id" },
];

function present(key: string, alts: string[] = []): boolean {
  const keys = [key, ...alts];
  return keys.some((k) => {
    const v = process.env[k];
    return typeof v === "string" && v.trim().length > 0 && !v.includes("YOUR_") && v !== "your_msg91_auth_key";
  });
}

export function collectEnvHealth(): {
  ok: boolean;
  criticalMissing: string[];
  recommendedMissing: string[];
  checks: EnvCheck[];
} {
  const checks: EnvCheck[] = [];
  for (const row of CRITICAL) {
    checks.push({
      key: row.key,
      present: present(row.key, row.alts),
      critical: true,
      note: row.note,
    });
  }
  for (const row of RECOMMENDED) {
    checks.push({
      key: row.key,
      present: present(row.key, row.alts),
      critical: false,
      note: row.note,
    });
  }
  const allowInMemory =
    process.env.ALLOW_INMEMORY_OTP === "1" || process.env.ALLOW_INMEMORY_OTP === "true";
  const criticalMissing = checks.filter((c) => c.critical && !c.present).map((c) => c.key);
  const recommendedMissing = checks
    .filter((c) => !c.critical && !c.present)
    .filter((c) => {
      // Single-instance Cloud Run may intentionally skip Redis when ALLOW_INMEMORY_OTP=1.
      if (c.key === "REDIS_URL" && allowInMemory) return false;
      if (c.key === "ALLOW_INMEMORY_OTP" && present("REDIS_URL")) return false;
      return true;
    })
    .map((c) => c.key);
  return {
    ok: criticalMissing.length === 0,
    criticalMissing,
    recommendedMissing,
    checks,
  };
}

/** Call once at boot. Fatals in production if critical env missing. */
export function assertEnvHealthAtBoot(): void {
  const health = collectEnvHealth();

  if (health.criticalMissing.length) {
    logger.error(
      { criticalMissing: health.criticalMissing },
      "Critical environment variables missing — features will fail open or 5xx",
    );
    if (process.env.NODE_ENV === "production" && process.env.ALLOW_WEAK_ENV !== "1") {
      // Do not exit for recommended-only gaps; only critical.
      logger.fatal({ missing: health.criticalMissing }, "Refusing to boot with critical env missing");
      process.exit(1);
    }
  } else {
    logger.info(
      { recommendedMissing: health.recommendedMissing },
      "Critical env OK",
    );
  }
  if (health.recommendedMissing.length) {
    logger.warn({ recommendedMissing: health.recommendedMissing }, "Recommended env vars missing");
  }
}
