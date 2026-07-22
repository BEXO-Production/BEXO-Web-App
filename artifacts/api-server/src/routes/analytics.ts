import { Router } from "express";
import { and, count, desc, eq, gte, sql } from "drizzle-orm";
import { contactSubmissions, db, leadReplies, profileSections, profiles, users } from "@workspace/db";
import { requireAuth, optionalAuth, type AuthenticatedRequest } from "../middlewares/auth";
import {
  getPortfolioAnalyticsSummary,
  recordAppEvent,
  recordPortfolioHit,
  resolveProfileIdForHandle,
  rollupPortfolioStats,
} from "../lib/analytics";
import { resolveSiteAccess, planHasAnalytics } from "../lib/siteAccess";
import { enqueueEmail, processEmailOutbox } from "../lib/emailOutbox";
import { logger } from "../lib/logger";
import { portfolioHostname } from "../lib/platform";

const router = Router();

const hitLimiter = new Map<string, { count: number; resetAt: number }>();

function allowHit(key: string, max = 60, windowMs = 60_000): boolean {
  const now = Date.now();
  const row = hitLimiter.get(key);
  if (!row || row.resetAt < now) {
    hitLimiter.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (row.count >= max) return false;
  row.count += 1;
  return true;
}

/** Public: portfolio visitor beacon (fire-and-forget). */
router.post("/portfolio-hit", async (req, res) => {
  try {
    const handle = String(req.body?.handle || "").toLowerCase().trim();
    const profileIdBody = typeof req.body?.profileId === "string" ? req.body.profileId : null;
    if (!handle && !profileIdBody) {
      res.status(400).json({ error: "handle required" });
      return;
    }

    const profileId = profileIdBody || (handle ? await resolveProfileIdForHandle(handle) : null);
    if (!profileId) {
      res.status(404).json({ error: "Profile not found" });
      return;
    }

    const ip =
      (req.headers["cf-connecting-ip"] as string) ||
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      req.ip ||
      "";
    const rateKey = `${profileId}:${ip || "anon"}`;
    if (!allowHit(rateKey)) {
      res.status(204).end();
      return;
    }

    const isOwnerPreview =
      req.body?.preview === true ||
      String(req.query.preview || "") === "1" ||
      String(req.headers["x-bexo-preview"] || "") === "1";

    await recordPortfolioHit({
      profileId,
      path: typeof req.body?.path === "string" ? req.body.path : "/",
      referrer: typeof req.body?.referrer === "string" ? req.body.referrer : req.get("referer"),
      userAgent: req.get("user-agent"),
      ip,
      isOwnerPreview,
    });

    res.status(204).end();
  } catch (err) {
    logger.warn({ err }, "portfolio-hit failed");
    res.status(204).end();
  }
});

/** Optional auth: web-app product events for BEXO ops. */
router.post("/app", optionalAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const eventName = String(req.body?.eventName || req.body?.name || "").slice(0, 80);
    if (!eventName) {
      res.status(400).json({ error: "eventName required" });
      return;
    }
    await recordAppEvent({
      userId: req.user?.id || null,
      sessionId: typeof req.body?.sessionId === "string" ? req.body.sessionId : null,
      eventName,
      props: typeof req.body?.props === "object" && req.body.props ? req.body.props : {},
    });
    res.status(204).end();
  } catch (err) {
    logger.warn({ err }, "app analytics event failed");
    res.status(204).end();
  }
});

/** Owner: portfolio analytics summary (Essential / Growth). */
router.get("/portfolio/summary", requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  try {
    const access = await resolveSiteAccess(userId);
    const [profile] = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1);
    if (!profile) {
      res.status(404).json({ error: "Profile not found" });
      return;
    }

    const days = Number(req.query.days) || 30;
    // Opportunistic rollup so dashboards stay fresh without waiting for cron.
    if (planHasAnalytics(access.subscription.plan)) {
      rollupPortfolioStats(2).catch(() => undefined);
    }

    const summary = await getPortfolioAnalyticsSummary({
      profileId: profile.id,
      plan: access.subscription.plan,
      days,
    });

    // Live leads from contact_submissions (rollup can lag / miss days).
    const [leadTotals] = await db
      .select({
        total: count(),
        unread: sql<number>`count(*) filter (where ${contactSubmissions.readAt} is null)`.mapWith(Number),
      })
      .from(contactSubmissions)
      .where(eq(contactSubmissions.userId, userId));

    const liveLeads = Number(leadTotals?.total) || 0;
    const unreadLeads = Number(leadTotals?.unread) || 0;

    res.json({
      ...summary,
      totals: {
        ...(summary as any).totals,
        // Prefer live inbox count for the dashboard badge.
        leads: liveLeads,
        leadsUnread: unreadLeads,
        leadsFromRollup: (summary as any).totals?.leads ?? 0,
      },
    });
  } catch (err: any) {
    logger.error({ err, userId }, "analytics summary failed");
    res.status(500).json({ error: err.message || "Unable to load analytics" });
  }
});

/** Owner: leads inbox from contact_submissions. */
router.get("/leads", requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  try {
    const access = await resolveSiteAccess(userId);
    if (!planHasAnalytics(access.subscription.plan)) {
      res.status(403).json({
        error: "Leads inbox unlocks on Essential and Growth.",
        requiredPlans: ["essential", "growth"],
      });
      return;
    }

    const rows = await db
      .select()
      .from(contactSubmissions)
      .where(eq(contactSubmissions.userId, userId))
      .orderBy(desc(contactSubmissions.createdAt))
      .limit(200);

    const unread = rows.filter((r) => !r.readAt).length;

    res.json({
      total: rows.length,
      unread,
      leads: rows.map((r) => ({
        id: r.id,
        senderName: r.senderName,
        senderEmail: r.senderEmail,
        senderPhone: r.senderPhone,
        message: r.message,
        handle: r.handle,
        deliveryStatus: r.deliveryStatus,
        readAt: r.readAt,
        createdAt: r.createdAt,
      })),
    });
  } catch (err: any) {
    logger.error({ err, userId }, "leads list failed");
    res.status(500).json({ error: err.message || "Unable to load leads" });
  }
});

router.post("/leads/:id/read", requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const id = String(req.params.id || "");
  try {
    const access = await resolveSiteAccess(userId);
    if (!planHasAnalytics(access.subscription.plan)) {
      res.status(403).json({ error: "Leads inbox unlocks on Essential and Growth." });
      return;
    }
    await db
      .update(contactSubmissions)
      .set({ readAt: new Date(), updatedAt: new Date() })
      .where(and(eq(contactSubmissions.id, id), eq(contactSubmissions.userId, userId)));
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Unable to mark lead read" });
  }
});

const REPLY_MAX_BODY = 4000;
const REPLY_MAX_SUBJECT = 160;
const REPLY_DAILY_CAP = 30;
const REPLY_PER_THREAD_CAP = 15;

function stripForSnippet(raw: string, max = 280): string {
  const text = String(raw || "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** Conversation thread: original lead + owner replies. */
router.get("/leads/:id/thread", requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const id = String(req.params.id || "");
  try {
    const access = await resolveSiteAccess(userId);
    if (!planHasAnalytics(access.subscription.plan)) {
      res.status(403).json({
        error: "In-app replies unlock on Essential and Growth.",
        code: "PLAN_REQUIRED",
        requiredPlans: ["essential", "growth"],
      });
      return;
    }

    const [lead] = await db
      .select()
      .from(contactSubmissions)
      .where(and(eq(contactSubmissions.id, id), eq(contactSubmissions.userId, userId)))
      .limit(1);
    if (!lead) {
      res.status(404).json({ error: "Lead not found." });
      return;
    }

    const replies = await db
      .select()
      .from(leadReplies)
      .where(eq(leadReplies.contactSubmissionId, id))
      .orderBy(desc(leadReplies.createdAt));

    res.json({
      canReply: true,
      lead: {
        id: lead.id,
        senderName: lead.senderName,
        senderEmail: lead.senderEmail,
        senderPhone: lead.senderPhone,
        message: lead.message,
        handle: lead.handle,
        readAt: lead.readAt,
        createdAt: lead.createdAt,
      },
      replies: replies
        .slice()
        .reverse()
        .map((r) => ({
          id: r.id,
          subject: r.subject,
          body: r.body,
          toEmail: r.toEmail,
          toName: r.toName,
          fromName: r.fromName,
          status: r.status,
          lastError: r.lastError,
          createdAt: r.createdAt,
          sentAt: r.sentAt,
        })),
    });
  } catch (err: any) {
    logger.error({ err, userId, id }, "lead thread failed");
    res.status(500).json({ error: err.message || "Unable to load conversation" });
  }
});

/** Send an in-app reply to a lead (Essential / Growth). Logged + emailed via outbox. */
router.post("/leads/:id/reply", requireAuth, async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const id = String(req.params.id || "");
  const body = String(req.body?.body || "").trim();
  const subjectRaw = typeof req.body?.subject === "string" ? req.body.subject.trim() : "";

  try {
    const access = await resolveSiteAccess(userId);
    if (!planHasAnalytics(access.subscription.plan)) {
      res.status(403).json({
        error: "In-app email replies are available on Essential and Growth.",
        code: "PLAN_REQUIRED",
        requiredPlans: ["essential", "growth"],
      });
      return;
    }

    if (body.length < 2 || body.length > REPLY_MAX_BODY) {
      res.status(400).json({ error: `Reply must be between 2 and ${REPLY_MAX_BODY} characters.` });
      return;
    }

    const [lead] = await db
      .select()
      .from(contactSubmissions)
      .where(and(eq(contactSubmissions.id, id), eq(contactSubmissions.userId, userId)))
      .limit(1);
    if (!lead) {
      res.status(404).json({ error: "Lead not found." });
      return;
    }

    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const [dayCount] = await db
      .select({ n: count() })
      .from(leadReplies)
      .where(and(eq(leadReplies.userId, userId), gte(leadReplies.createdAt, dayStart)));
    if (Number(dayCount?.n || 0) >= REPLY_DAILY_CAP) {
      res.status(429).json({
        error: `Daily reply limit reached (${REPLY_DAILY_CAP}). Try again tomorrow.`,
        code: "DAILY_CAP",
      });
      return;
    }

    const [threadCount] = await db
      .select({ n: count() })
      .from(leadReplies)
      .where(eq(leadReplies.contactSubmissionId, id));
    if (Number(threadCount?.n || 0) >= REPLY_PER_THREAD_CAP) {
      res.status(429).json({
        error: "This conversation has reached the reply limit. Continue over email if needed.",
        code: "THREAD_CAP",
      });
      return;
    }

    const [owner] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    const [profile] = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1);
    let ownerEmail = String(owner?.email || "").trim();
    if (profile) {
      const sections = await db.select().from(profileSections).where(eq(profileSections.profileId, profile.id));
      const contact = sections.find((s) => s.type === "contact")?.entries as any;
      if (contact?.email) ownerEmail = String(contact.email).trim() || ownerEmail;
    }

    const ownerName = String(owner?.name || profile?.handle || "BEXO member").trim();
    const subject =
      (subjectRaw || `Re: Your message on ${lead.handle ? portfolioHostname(lead.handle) : "BEXO"}`).slice(
        0,
        REPLY_MAX_SUBJECT,
      );

    const [reply] = await db
      .insert(leadReplies)
      .values({
        contactSubmissionId: lead.id,
        userId,
        toEmail: lead.senderEmail,
        toName: lead.senderName,
        fromName: ownerName,
        replyToEmail: ownerEmail || null,
        subject,
        body,
        status: "queued",
      })
      .returning();

    // Mark lead read when owner engages.
    if (!lead.readAt) {
      await db
        .update(contactSubmissions)
        .set({ readAt: new Date(), updatedAt: new Date() })
        .where(eq(contactSubmissions.id, lead.id));
    }

    const delivery = await enqueueEmail({
      eventType: "lead_reply",
      recipient: lead.senderEmail,
      subject,
      dedupeKey: `lead_reply:${reply.id}`,
      userId,
      relatedId: reply.id,
      payload: {
        userName: ownerName,
        ownerName,
        recipientName: lead.senderName,
        handle: lead.handle,
        body,
        replyTo: ownerEmail || undefined,
        originalSnippet: stripForSnippet(lead.message),
      },
    });

    if (delivery?.id) {
      await db.update(leadReplies).set({ emailDeliveryId: delivery.id }).where(eq(leadReplies.id, reply.id));
    }

    // Deliver promptly instead of waiting for the 30s worker tick.
    await processEmailOutbox(5).catch(() => undefined);

    const [fresh] = await db.select().from(leadReplies).where(eq(leadReplies.id, reply.id)).limit(1);

    res.json({
      success: true,
      reply: {
        id: fresh?.id || reply.id,
        subject: fresh?.subject || subject,
        body: fresh?.body || body,
        toEmail: lead.senderEmail,
        toName: lead.senderName,
        fromName: ownerName,
        status: fresh?.status || "queued",
        lastError: fresh?.lastError || null,
        createdAt: fresh?.createdAt || reply.createdAt,
        sentAt: fresh?.sentAt || null,
      },
      message:
        fresh?.status === "sent"
          ? `Reply sent to ${lead.senderEmail}.`
          : fresh?.status === "skipped"
            ? "Reply saved. Email delivery is not configured in this environment."
            : "Reply queued for delivery.",
    });
  } catch (err: any) {
    logger.error({ err, userId, id }, "lead reply failed");
    res.status(500).json({ error: err.message || "Unable to send reply right now." });
  }
});

export default router;
