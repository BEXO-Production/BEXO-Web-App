import { Router } from "express";
import Redis from "ioredis";
import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";
import { logger } from "../lib/logger";
import { OTP_MAX_TTL_SECONDS } from "../lib/userRetention";
import { resolveUserSessionForPhone } from "../lib/authSession";
import { verifyWidgetAccessToken } from "../lib/msg91Widget";

const router = Router();

import { createRequire } from "module";

export function normalizePhone(rawPhone: unknown): string {
  if (!rawPhone || typeof rawPhone !== "string") return "";
  const digits = rawPhone.replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  return digits;
}

class RedisOrMemoryStore {
  private redis: any = null;
  private memory = new Map<string, { value: string; expires: number }>();

  constructor() {
    const redisUrl = process.env.REDIS_URL;
    if (redisUrl) {
      try {
        this.redis = new Redis(redisUrl, {
          maxRetriesPerRequest: 1,
          connectTimeout: 2000,
        });
        this.redis.on("error", (err: any) => {
          logger.warn("Redis connection error, using in-memory store for this operation.");
        });
      } catch (err) {
        logger.error({ err }, "Failed to initialize Redis, using in-memory store");
      }
    } else {
      logger.info("No REDIS_URL provided. Using in-memory store for OTPs.");
    }
  }

  async set(key: string, value: string, mode?: string, ttl?: number): Promise<void> {
    const expires = ttl ? Date.now() + ttl * 1000 : Infinity;
    this.memory.set(key, { value, expires });

    if (this.redis) {
      try {
        if (mode === "EX" && ttl) {
          await this.redis.set(key, value, "EX", ttl);
        } else {
          await this.redis.set(key, value);
        }
      } catch (err) {
        logger.warn("Redis set failed, used memory fallback");
      }
    }
  }

  async get(key: string): Promise<string | null> {
    if (this.redis) {
      try {
        const val = await this.redis.get(key);
        if (val) return val;
      } catch (err) {
        logger.warn("Redis get failed, falling back to memory");
      }
    }
    const item = this.memory.get(key);
    if (!item) return null;
    if (Date.now() > item.expires) {
      this.memory.delete(key);
      return null;
    }
    return item.value;
  }

  async del(key: string): Promise<void> {
    this.memory.delete(key);
    if (this.redis) {
      try {
        await this.redis.del(key);
      } catch (err) {
        logger.warn("Redis del failed");
      }
    }
  }

  /** Atomic increment for rate limits (Redis INCR, or sync Map in-process). */
  async incr(key: string, ttlSeconds: number): Promise<number> {
    if (this.redis) {
      try {
        const n = await this.redis.incr(key);
        if (n === 1 && ttlSeconds > 0) {
          await this.redis.expire(key, ttlSeconds);
        }
        const expires = ttlSeconds ? Date.now() + ttlSeconds * 1000 : Infinity;
        this.memory.set(key, { value: String(n), expires });
        return n;
      } catch (err) {
        logger.warn("Redis incr failed, using memory fallback");
      }
    }
    const item = this.memory.get(key);
    let n = 1;
    let expires = ttlSeconds ? Date.now() + ttlSeconds * 1000 : Infinity;
    if (item && Date.now() <= item.expires) {
      n = (parseInt(item.value, 10) || 0) + 1;
      expires = item.expires;
    }
    this.memory.set(key, { value: String(n), expires });
    return n;
  }
}

const store = new RedisOrMemoryStore();

const phonePattern = /^\d{10,15}$/;
/** 4 digits — matches the MSG91 OTP Widget's configured OTP length (Widget Settings). */
const OTP_LENGTH = 4;
const otpPattern = /^\d{4}$/;
/** Wrong OTP attempts before lockout. */
const OTP_VERIFY_MAX_ATTEMPTS = 3;
/** Lock + fail-counter window after hitting the attempt limit. */
const OTP_VERIFY_LOCK_SECONDS = 8 * 60 * 60; // 8 hours

function isDatabaseUnavailable(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: string }).code;
  // Direct code match (pg driver, Node DNS, etc.)
  if (["ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND", "EHOSTUNREACH", "ENETUNREACH", "57P01", "57P03", "57P02", "08001", "08006"].includes(code ?? "")) {
    return true;
  }
  // Drizzle wraps the original error in its message
  const msg = String((error as { message?: string }).message ?? "");
  if (msg.includes("ENOTFOUND") || msg.includes("ECONNREFUSED") || msg.includes("ETIMEDOUT") || msg.includes("tenant/user") || msg.includes("connection terminated")) {
    return true;
  }
  return false;
}

// POST /auth/phone/otp
router.post("/phone/otp", async (req, res): Promise<void> => {
  const phone = normalizePhone(req.body?.phone);
  if (!phone || phone.length < 10) {
    res.status(400).json({ error: "Missing or invalid phone number" });
    return;
  }

  try {
  const lockKey = `otp_limit:lock:${phone}`;
  const isLocked = await store.get(lockKey);
  if (isLocked) {
    res.status(429).json({ error: "Too many OTP requests. Please try again after 15 minutes." });
    return;
  }

  const countKey = `otp_limit:count:${phone}`;
  const currentCount = await store.incr(countKey, 900);

  if (currentCount > 5) {
    await store.set(lockKey, "true", "EX", 900);
    res.status(429).json({ error: "Too many OTP requests. Please try again after 15 minutes." });
    return;
  }

  // Reuse existing unexpired OTP if one was generated recently
  // to avoid sending conflicting OTP codes on rapid resend requests.
  const existingOtp = await store.get(`otp:${phone}`);
  let otp = existingOtp;
  if (!otp) {
    otp = Math.floor(1000 + Math.random() * 9000).toString();
    // OTP lives only in Redis — never persist unverified phones to Postgres.
    // Cap TTL at 30 minutes per retention policy (default 5 minutes).
    const ttl = Math.min(300, OTP_MAX_TTL_SECONDS);
    await store.set(`otp:${phone}`, otp, "EX", ttl);
  }

  const authKey = process.env.MSG91_AUTH_KEY;
  const integratedNumber = process.env.MSG91_INTEGRATED_NUMBER;
  const templateName = process.env.MSG91_TEMPLATE_NAME;
  const namespace = process.env.MSG91_TEMPLATE_NAMESPACE;

  const isConfigured = !!(authKey && authKey !== "your_msg91_auth_key" &&
                       integratedNumber && integratedNumber !== "your_whatsapp_number_with_country_code" &&
                       templateName && templateName !== "your_approved_template_name");
  const isProduction = process.env.NODE_ENV === "production";

  logger.info({ phone, isConfigured, isReused: !!existingOtp }, "Generated OTP for phone");

  // Production must fail closed when MSG91 is not configured (never mock-success).
  if (!isConfigured && isProduction) {
    res.status(503).json({
      error: "SMS/WhatsApp delivery is temporarily unavailable. Please try again later.",
    });
    return;
  }

  let deliveryOk = !isConfigured; // mock path is intentionally local/dev-only
  if (isConfigured) {
    try {
      const payload = {
        integrated_number: integratedNumber,
        content_type: "template",
        payload: {
          messaging_product: "whatsapp",
          type: "template",
          template: {
            name: templateName,
            language: {
              code: process.env.MSG91_TEMPLATE_LANGUAGE === "en_US" ? "en" : (process.env.MSG91_TEMPLATE_LANGUAGE || "en"),
              policy: "deterministic"
            },
            namespace: namespace || "",
            to_and_components: [
              {
                to: [phone],
                components: {
                  body_1: {
                    type: "text",
                    value: otp
                  },
                  button_1: {
                    subtype: "url",
                    type: "text",
                    value: otp
                  }
                }
              }
            ]
          }
        }
      };

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      let response: Response;
      try {
        response = await fetch("https://api.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/", {
          method: "POST",
          headers: {
            "authkey": authKey!,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }

      if (!response.ok) {
        const errText = await response.text();
        logger.error({ status: response.status, error: errText }, "MSG91 API error response");
        throw new Error(`MSG91 API returned status ${response.status}`);
      }

      const respData = await response.json();
      deliveryOk = true;
      logger.info({ respData }, "Successfully sent OTP via MSG91 WhatsApp");
    } catch (err) {
      logger.error({ err }, "Failed to send OTP via MSG91 WhatsApp API");
      deliveryOk = false;
    }
  } else {
    // Never log plaintext OTP in production (unreachable here); in non-prod log only last 2 digits.
    logger.info(`[MSG91 OTP MOCK] Auth key not set. Code for ${phone} ends in **${otp.slice(-2)}`);
  }

  if (!deliveryOk) {
    res.status(502).json({
      error: "We couldn't deliver the WhatsApp code right now. Please try again in a moment.",
    });
    return;
  }

  res.json({ success: true, message: "OTP sent successfully" });
  } catch (err) {
    logger.error({ err, phone }, "OTP send route failed");
    res.status(500).json({ error: "We couldn't send a verification code right now. Please try again." });
  }
});

// POST /auth/phone/otp/verify
router.post("/phone/otp/verify", async (req, res): Promise<void> => {
  const requestId = randomUUID();
  const phone = normalizePhone(req.body?.phone);
  const rawOtp = req.body?.otp;
  const otp = typeof rawOtp === "string" ? rawOtp.replace(/\D/g, "") : "";

  if (!phonePattern.test(phone) || !otpPattern.test(otp)) {
    res.status(400).json({ error: `Enter a valid phone number and ${OTP_LENGTH}-digit verification code.` });
    return;
  }

  try {
    const verifyLockKey = `otp_lock:${phone}`;
    const verifyFailKey = `otp_fail:${phone}`;
    const isVerifyLocked = await store.get(verifyLockKey);
    if (isVerifyLocked) {
      res.status(429).json({
        error: "Too many failed verification attempts. Please try again after 8 hours.",
        code: "OTP_VERIFY_LOCKED",
        retryAfterSeconds: OTP_VERIFY_LOCK_SECONDS,
      });
      return;
    }

    // 1. Idempotency: only replay the cached session for the SAME OTP
    // (absorbs double-submit). Wrong OTP must never mint a JWT.
    const recentSessionJson = await store.get(`verified_session:${phone}:${otp}`);
    if (recentSessionJson) {
      try {
        const recentSession = JSON.parse(recentSessionJson);
        logger.info({ phone, userId: recentSession.user?.id }, "Returning cached session for duplicate verification request");
        res.json(recentSession);
        return;
      } catch {}
    }

    // 2. Verify OTP code against cached OTP
    const cachedOtp = await store.get(`otp:${phone}`);
    const isDevelopmentBypass = process.env.NODE_ENV !== "production" && otp === "1111";

    if (!isDevelopmentBypass && otp !== cachedOtp) {
      const failCount = await store.incr(verifyFailKey, OTP_VERIFY_LOCK_SECONDS);
      if (failCount >= OTP_VERIFY_MAX_ATTEMPTS) {
        await store.set(verifyLockKey, "true", "EX", OTP_VERIFY_LOCK_SECONDS);
        res.status(429).json({
          error: "Too many failed verification attempts. Please try again after 8 hours.",
          code: "OTP_VERIFY_LOCKED",
          retryAfterSeconds: OTP_VERIFY_LOCK_SECONDS,
        });
        return;
      }
      const remaining = OTP_VERIFY_MAX_ATTEMPTS - failCount;
      const isProduction = process.env.NODE_ENV === "production";
      logger.warn(
        {
          phone,
          submittedOtpSuffix: isProduction ? undefined : otp.slice(-2),
          cachedOtpExists: !!cachedOtp,
          failCount,
          remaining,
        },
        "OTP verification mismatch",
      );
      res.status(400).json({
        error:
          remaining === 1
            ? "Invalid or expired code. 1 attempt left before an 8-hour lock."
            : `Invalid or expired code. ${remaining} attempts left.`,
        code: "OTP_INVALID",
        attemptsRemaining: remaining,
      });
      return;
    }

    // Successful verify — clear fail counter / lock
    await store.del(verifyFailKey);
    await store.del(verifyLockKey);

    const session = await resolveUserSessionForPhone(phone, req.headers.authorization);
    if (session.status !== 200) {
      res.status(session.status).json(session.body);
      return;
    }

    // Consume the OTP code
    await store.del(`otp:${phone}`);

    // Cache the verified response for 30s keyed by phone+otp (double-submit only)
    await store.set(`verified_session:${phone}:${otp}`, JSON.stringify(session.body), "EX", 30);

    res.json(session.body);
  } catch (err: any) {
    const dbDown = isDatabaseUnavailable(err);
    logger.error(
      { err, requestId, phone, isDatabaseError: dbDown, errorCode: err?.code, errorMessage: err?.message },
      "OTP verification failed",
    );
    if (dbDown) {
      res.status(503).json({
        error: "Our database is temporarily unreachable. Please try again in a few seconds.",
        requestId,
      });
    } else {
      res.status(500).json({
        error: "We couldn't complete verification right now. Please try again in a moment.",
        requestId,
      });
    }
  }
});

// POST /auth/phone/widget-verify
//
// The primary phone sign-in path as of the MSG91 OTP Widget migration: the
// client (web widget or the mobile WebView wrapper) sends and verifies the
// OTP itself via MSG91 directly — SMS primary, WhatsApp fallback, per the
// widget's Channels Configuration — and hands us the resulting widget access
// token. We confirm that token server-side with MSG91, then run the exact
// same account resolution the old custom-OTP flow used.
//
// `/phone/otp` and `/phone/otp/verify` above are kept only as a fallback
// while the widget rollout is verified end-to-end; nothing new should call
// them once this path is live.
router.post("/phone/widget-verify", async (req, res): Promise<void> => {
  const requestId = randomUUID();
  const widgetToken = typeof req.body?.widgetToken === "string" ? req.body.widgetToken : "";

  if (!widgetToken) {
    res.status(400).json({ error: "Missing verification token." });
    return;
  }

  try {
    const verification = await verifyWidgetAccessToken(widgetToken);
    if (!verification.verified || !verification.identifier) {
      res.status(400).json({
        error: verification.error || "That verification code is invalid or expired.",
        code: "OTP_INVALID",
      });
      return;
    }

    const phone = normalizePhone(verification.identifier);
    if (!phonePattern.test(phone)) {
      logger.error({ identifier: verification.identifier }, "MSG91 widget returned an unrecognized identifier shape");
      res.status(400).json({ error: "Couldn't confirm that phone number. Please try again." });
      return;
    }

    const session = await resolveUserSessionForPhone(phone, req.headers.authorization);
    res.status(session.status).json(session.body);
  } catch (err: any) {
    const dbDown = isDatabaseUnavailable(err);
    logger.error(
      { err, requestId, isDatabaseError: dbDown, errorMessage: err?.message },
      "Widget verification failed",
    );
    res.status(dbDown ? 503 : 500).json({
      error: dbDown
        ? "Our database is temporarily unreachable. Please try again in a few seconds."
        : "We couldn't complete verification right now. Please try again in a moment.",
      requestId,
    });
  }
});

// POST /auth/logout
router.post("/logout", (req, res) => {
  res.json({ success: true, message: "Logged out successfully" });
});

export default router;
