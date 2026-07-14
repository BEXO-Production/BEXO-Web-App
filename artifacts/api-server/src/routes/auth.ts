import { Router } from "express";
import Redis from "ioredis";
import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";
import { db, users, profiles } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";

const router = Router();

import { createRequire } from "module";

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
    if (this.redis) {
      try {
        if (mode === "EX" && ttl) {
          await this.redis.set(key, value, "EX", ttl);
        } else {
          await this.redis.set(key, value);
        }
        return;
      } catch (err) {
        logger.warn("Redis set failed, falling back to memory");
      }
    }
    const expires = ttl ? Date.now() + ttl * 1000 : Infinity;
    this.memory.set(key, { value, expires });
  }

  async get(key: string): Promise<string | null> {
    if (this.redis) {
      try {
        return await this.redis.get(key);
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
    if (this.redis) {
      try {
        await this.redis.del(key);
        return;
      } catch (err) {
        logger.warn("Redis del failed, falling back to memory");
      }
    }
    this.memory.delete(key);
  }
}

const store = new RedisOrMemoryStore();

const phonePattern = /^\d{10,15}$/;
const otpPattern = /^\d{6}$/;

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
  const { phone } = req.body;
  if (!phone || typeof phone !== "string") {
    res.status(400).json({ error: "Missing or invalid phone number" });
    return;
  }

  const lockKey = `otp_limit:lock:${phone}`;
  const isLocked = await store.get(lockKey);
  if (isLocked) {
    res.status(429).json({ error: "Too many OTP requests. Please try again after 15 minutes." });
    return;
  }

  const countKey = `otp_limit:count:${phone}`;
  const countVal = await store.get(countKey);
  const currentCount = countVal ? parseInt(countVal, 10) : 0;

  if (currentCount >= 3) {
    await store.set(lockKey, "true", "EX", 900);
    await store.del(countKey);
    res.status(429).json({ error: "Too many OTP requests. Please try again after 15 minutes." });
    return;
  }

  // Generate a secure 6-digit OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  // Store in Redis with a 5-minute TTL
  await store.set(`otp:${phone}`, otp, "EX", 300);

  // Increment the request count
  await store.set(countKey, (currentCount + 1).toString(), "EX", 900);

  const authKey = process.env.MSG91_AUTH_KEY;
  const integratedNumber = process.env.MSG91_INTEGRATED_NUMBER;
  const templateName = process.env.MSG91_TEMPLATE_NAME;
  const namespace = process.env.MSG91_TEMPLATE_NAMESPACE;

  const isConfigured = authKey && authKey !== "your_msg91_auth_key" &&
                       integratedNumber && integratedNumber !== "your_whatsapp_number_with_country_code" &&
                       templateName && templateName !== "your_approved_template_name";

  logger.info({ phone, otp, isConfigured }, "Generated OTP for phone");

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

      const response = await fetch("https://api.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/", {
        method: "POST",
        headers: {
          "authkey": authKey!,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errText = await response.text();
        logger.error({ status: response.status, error: errText }, "MSG91 API error response");
        throw new Error(`MSG91 API returned status ${response.status}`);
      }

      const respData = await response.json();
      logger.info({ respData }, "Successfully sent OTP via MSG91 WhatsApp");
    } catch (err) {
      logger.error({ err }, "Failed to send OTP via MSG91 WhatsApp API");
    }
  } else {
    logger.info(`[MSG91 OTP MOCK] Auth key not set. Code for ${phone} is ${otp}`);
  }

  res.json({ success: true, message: "OTP sent successfully" });
});

// POST /auth/phone/otp/verify
router.post("/phone/otp/verify", async (req, res): Promise<void> => {
  const requestId = randomUUID();
  const rawPhone = req.body?.phone;
  const rawOtp = req.body?.otp;
  const phone = typeof rawPhone === "string" ? rawPhone.replace(/\D/g, "") : "";
  const otp = typeof rawOtp === "string" ? rawOtp.replace(/\D/g, "") : "";

  if (!phonePattern.test(phone) || !otpPattern.test(otp)) {
    res.status(400).json({ error: "Enter a valid phone number and 6-digit verification code." });
    return;
  }

  try {
    // Check the code before touching account records. The development bypass is
    // deliberately restricted to non-production environments.
    const cachedOtp = await store.get(`otp:${phone}`);
    const isDevelopmentBypass = process.env.NODE_ENV !== "production" && otp === "111111";
    if (!isDevelopmentBypass && otp !== cachedOtp) {
      res.status(400).json({ error: "This code is invalid or has expired. Request a new code and try again." });
      return;
    }

    // Find or create user
    let user = (await db.select().from(users).where(eq(users.phone, phone)).limit(1))[0];
    let isNewUser = false;
    let hasCompletedOnboarding = false;

    if (!user) {
      isNewUser = true;
      try {
        const inserted = await db.insert(users).values({
          phone,
          phoneVerifiedAt: new Date(),
        }).returning();
        user = inserted[0];
      } catch (error) {
        // Two verification requests can complete together. In that case, reuse
        // the account created by the other request instead of returning a 500.
        if ((error as { code?: string }).code !== "23505") throw error;
        user = (await db.select().from(users).where(eq(users.phone, phone)).limit(1))[0];
        if (!user) throw error;
        isNewUser = false;
      }
      logger.info({ userId: user.id, phone }, "Created new user on verification");
    } else {
      // Update verification timestamp
      await db.update(users).set({
        phoneVerifiedAt: new Date()
      }).where(eq(users.id, user.id));

      // Check if they completed onboarding (profile exists and has a handle)
      const userProfile = await db.select().from(profiles).where(eq(profiles.userId, user.id)).limit(1);
      if (userProfile.length > 0 && userProfile[0].handle) {
        hasCompletedOnboarding = true;
      }
    }

    // Consume the code only after the account operation succeeds. A temporary
    // database fault should not force the user to request another OTP.
    await store.del(`otp:${phone}`);

    // Generate JWT token
    const secret = process.env.JWT_SECRET || "super_secret_jwt_key";
    const accessToken = jwt.sign({ id: user.id }, secret, { expiresIn: "7d" });

    res.json({
      accessToken,
      isNewUser,
      hasCompletedOnboarding,
      user: {
        id: user.id,
        phone: user.phone,
        name: user.name,
        email: user.email,
      }
    });
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

// POST /auth/logout
router.post("/logout", (req, res) => {
  res.json({ success: true, message: "Logged out successfully" });
});

export default router;
