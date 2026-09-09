import { Router } from "express";
import { db, users, profiles } from "@workspace/db";
import { eq } from "drizzle-orm";
import { recordPortfolioHit } from "../lib/analytics";
import { portfolioPublicUrl, pathPortfolioUrl } from "../lib/platform";
import { logger } from "../lib/logger";

const router = Router();

/**
 * Proprietary BEXO Identity ID & Dynamic Routing:
 * Resolves /c/:cardCode (printed on physical NFC cards and physical/digital QR codes).
 *
 * Attribution channels:
 * - ?src=nfc -> "bexo:nfc" (Physical card NFC tap)
 * - ?src=qr  -> "bexo:qr"  (Physical/digital card QR scan)
 * - default  -> "bexo:card"
 *
 * Records internal portfolio visit bucket with proper channel attribution,
 * and 302 redirects visitor directly to the user's active portfolio URL.
 * Even if user changes handle, custom domain, or template, physical cards and NFC never break!
 */
router.get("/:cardCode", async (req, res) => {
  const cardCode = String(req.params.cardCode || "").trim().toLowerCase();
  if (!cardCode || !/^[a-z0-9_-]{4,32}$/i.test(cardCode)) {
    res.status(404).send("Invalid BEXO Identity Code.");
    return;
  }

  try {
    const [row] = await db
      .select({
        userId: users.id,
        cardCode: users.cardCode,
        handle: profiles.handle,
        profileId: profiles.id,
        isCustomDomainActive: profiles.isCustomDomainActive,
        customDomain: profiles.customDomain,
      })
      .from(users)
      .leftJoin(profiles, eq(profiles.userId, users.id))
      .where(eq(users.cardCode, cardCode))
      .limit(1);

    if (!row) {
      logger.warn({ cardCode }, "Card redirect: user not found for cardCode");
      res.status(404).send("BEXO Card not registered or invalid.");
      return;
    }

    // Determine attribution channel
    const srcQuery = String(req.query.src || "").toLowerCase().trim();
    let channelReferrer = "bexo:card";
    if (srcQuery === "nfc") {
      channelReferrer = "bexo:nfc";
    } else if (srcQuery === "qr") {
      channelReferrer = "bexo:qr";
    }

    const ip =
      (req.headers["cf-connecting-ip"] as string) ||
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      req.ip ||
      "";

    // Record visitor hit with attribution if profile exists
    if (row.profileId) {
      recordPortfolioHit({
        profileId: row.profileId,
        path: "/",
        referrer: channelReferrer,
        userAgent: req.get("user-agent"),
        ip,
      }).catch((err) => {
        logger.warn({ err, cardCode }, "Failed to record card redirect analytics hit");
      });
    }

    // Target destination URL
    let targetUrl: string;
    if (row.isCustomDomainActive && row.customDomain) {
      targetUrl = `https://${row.customDomain}`;
    } else if (row.handle) {
      targetUrl = portfolioPublicUrl(row.handle);
    } else {
      targetUrl = `https://${process.env.PLATFORM_DOMAIN || "atbexo.com"}`;
    }

    // Preserve any extra query parameters if present (except src)
    const extraParams = new URLSearchParams();
    for (const [key, value] of Object.entries(req.query)) {
      if (key !== "src" && typeof value === "string") {
        extraParams.set(key, value);
      }
    }
    const queryString = extraParams.toString();
    const finalDestination = queryString
      ? `${targetUrl}${targetUrl.includes("?") ? "&" : "?"}${queryString}`
      : targetUrl;

    logger.info(
      { cardCode, channel: channelReferrer, targetUrl: finalDestination },
      "BEXO Card dynamic routing 302 redirect",
    );

    // 302 Found redirect (temporary redirect so changes to handle/domain take effect immediately)
    res.redirect(302, finalDestination);
  } catch (err: any) {
    logger.error({ err, cardCode }, "Error processing card redirect");
    res.status(500).send("Unable to route card at this time.");
  }
});

export default router;
