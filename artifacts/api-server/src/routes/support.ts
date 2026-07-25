import { Router, type Response } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db, users, supportTickets, supportTicketEvents } from "@workspace/db";
import { requireAuth } from "../middlewares/auth";
import { allocateTicketNumber, isTicketChannel, isTicketPriority } from "../lib/supportTickets";
import { enqueueEmail } from "../lib/emailOutbox";
import { logger } from "../lib/logger";

const router = Router();

/** Authenticated user creates a support ticket → Admin Support inbox. */
router.post("/tickets", requireAuth, async (req: any, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });

  try {
    const subject = String(req.body?.subject || "").trim();
    const description = String(req.body?.description || "").trim();
    const channelRaw = String(req.body?.channel || "app").trim().toLowerCase();
    const priorityRaw = String(req.body?.priority || "normal").trim().toLowerCase();
    const channel = isTicketChannel(channelRaw) ? channelRaw : "app";
    const priority = isTicketPriority(priorityRaw) ? priorityRaw : "normal";

    if (subject.length < 3) {
      return res.status(400).json({ error: "Subject must be at least 3 characters" });
    }
    if (description.length < 5) {
      return res.status(400).json({ error: "Description must be at least 5 characters" });
    }

    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) return res.status(404).json({ error: "User not found" });
    if (!user.email) {
      return res.status(409).json({
        error: "Add an email to your account so we can reply to your ticket.",
        code: "EMAIL_REQUIRED",
      });
    }

    const ticketNumber = await allocateTicketNumber();
    const [ticket] = await db
      .insert(supportTickets)
      .values({
        ticketNumber,
        userId,
        createdByStaffId: null,
        assigneeStaffId: null,
        channel,
        subject,
        description,
        status: "open",
        priority,
        requesterEmail: user.email,
        requesterPhone: user.phone,
      })
      .returning();

    await db.insert(supportTicketEvents).values({
      ticketId: ticket.id,
      actorStaffId: null,
      eventType: "created",
      visibility: "customer",
      body: description,
      toStatus: "open",
      meta: { channel, priority, source: "dash_app" },
    });

    await enqueueEmail({
      eventType: "support_ticket_created",
      recipient: user.email,
      subject: `[${ticketNumber}] We received your support request`,
      dedupeKey: `support_ticket_created:${ticket.id}`,
      userId: user.id,
      relatedId: ticket.id,
      payload: {
        userName: user.name || "there",
        ticketNumber,
        subject,
        description,
      },
    });

    logger.info({ userId, ticketNumber }, "User-created support ticket");
    return res.status(201).json({ ticket });
  } catch (err) {
    logger.error({ err, userId }, "User support ticket create failed");
    return res.status(500).json({ error: "Could not create ticket" });
  }
});

/** List the signed-in user's own tickets. */
router.get("/tickets", requireAuth, async (req: any, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  try {
    const rows = await db
      .select()
      .from(supportTickets)
      .where(eq(supportTickets.userId, userId))
      .orderBy(desc(supportTickets.createdAt))
      .limit(50);
    return res.json({ tickets: rows });
  } catch (err) {
    return res.status(500).json({ error: "Could not load tickets" });
  }
});

router.get("/tickets/:id", requireAuth, async (req: any, res: Response) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: "Unauthorized" });
  try {
    const [ticket] = await db
      .select()
      .from(supportTickets)
      .where(and(eq(supportTickets.id, String(req.params.id)), eq(supportTickets.userId, userId)))
      .limit(1);
    if (!ticket) return res.status(404).json({ error: "Ticket not found" });
    const events = await db
      .select()
      .from(supportTicketEvents)
      .where(
        and(
          eq(supportTicketEvents.ticketId, ticket.id),
          eq(supportTicketEvents.visibility, "customer"),
        ),
      )
      .orderBy(desc(supportTicketEvents.createdAt));
    return res.json({ ticket, events });
  } catch (err) {
    return res.status(500).json({ error: "Could not load ticket" });
  }
});

export default router;
