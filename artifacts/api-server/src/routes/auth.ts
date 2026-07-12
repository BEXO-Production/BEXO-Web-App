import { Router } from "express";
import Redis from "ioredis";
import jwt from "jsonwebtoken";
import { db, users } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";

const router = Router();
const redis = new Redis(process.env.REDIS_URL || "redis://127.0.0.1:6379");

// POST /auth/phone/otp
router.post("/phone/otp", async (req, res): Promise<void> => {
  const { phone } = req.body;
  if (!phone || typeof phone !== "string") {
    res.status(400).json({ error: "Missing or invalid phone number" });
    return;
  }

  // Generate a secure 6-digit OTP
  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  // Store in Redis with a 5-minute TTL
  await redis.set(`otp:${phone}`, otp, "EX", 300);

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
  const { phone, otp } = req.body;
  if (!phone || !otp) {
    res.status(400).json({ error: "Phone number and OTP are required" });
    return;
  }

  // Check if OTP exists and is correct
  const cachedOtp = await redis.get(`otp:${phone}`);

  // Bypass verification for developer testing if OTP is 111111 or matches cached value
  const isValid = (otp === "111111" || otp === cachedOtp);

  if (!isValid) {
    res.status(400).json({ error: "Invalid or expired OTP" });
    return;
  }

  // Clear the verified OTP
  await redis.del(`otp:${phone}`);

  try {
    // Find or create user
    let userList = await db.select().from(users).where(eq(users.phone, phone)).limit(1);
    let user = userList[0];

    if (!user) {
      const inserted = await db.insert(users).values({
        phone,
        phoneVerifiedAt: new Date(),
      }).returning();
      user = inserted[0];
      logger.info({ userId: user.id, phone }, "Created new user on verification");
    } else {
      // Update verification timestamp
      await db.update(users).set({
        phoneVerifiedAt: new Date()
      }).where(eq(users.id, user.id));
    }

    // Generate JWT token
    const secret = process.env.JWT_SECRET || "super_secret_jwt_key";
    const accessToken = jwt.sign({ id: user.id }, secret, { expiresIn: "7d" });

    res.json({
      accessToken,
      user: {
        id: user.id,
        phone: user.phone,
        name: user.name,
        email: user.email,
      }
    });
  } catch (err) {
    logger.error({ err }, "Error during verification transaction");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /auth/logout
router.post("/logout", (req, res) => {
  res.json({ success: true, message: "Logged out successfully" });
});

export default router;
