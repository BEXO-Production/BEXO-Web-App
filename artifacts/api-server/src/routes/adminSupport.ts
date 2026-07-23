/**
 * Staff support ticketing APIs — lookup user by phone/email, create tickets,
 * status timeline, customer emails with ticket number.
 */
import { type IRouter, type Response } from "express";
import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import {
  adminAuditLog,
  db,
  payments,
  profiles,
  staffUsers,
  subscriptions,
  supportTicketEvents,
  supportTickets,
  users,
} from "@workspace/db";
import { staffGuard, type StaffRequest } from "../middlewares/staffAuth";
import { logger } from "../lib/logger";
import { enqueueEmail } from "../lib/emailOutbox";
import { pathPortfolioUrl, portfolioPublicUrl } from "../lib/platform";
import { resolveSubscriptionState } from "../lib/subscriptions";
import {
  allocateTicketNumber,
  isTicketChannel,
  isTicketPriority,
  isTicketStatus,
  statusLabel,
} from "../lib/supportTickets";

async function audit(
  req: StaffRequest,
  action: string,
  targetType: string | null,
  targetId: string | null,
  meta: Record<string, unknown> = {},
) {
  try {
    await db.insert(adminAuditLog).values({
      actorStaffId: req.staff?.id,
      action,
      targetType,
      targetId,
      meta,
      ip: String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || ""),
    });
  } catch (err) {
    logger.warn({ err, action }, "admin audit insert failed");
  }
}

function normalizePhoneDigits(value: string): string {
  return String(value || "").replace(/\D/g, "");
}

async function loadAssistUser(userId: string) {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return null;
  const [profile] = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1);
  const [sub] = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1);
  const subscriptionState = await resolveSubscriptionState(userId);
  const recentPayments = await db
    .select({
      id: payments.id,
      amount: payments.amount,
      status: payments.status,
      kind: payments.kind,
      createdAt: payments.createdAt,
    })
    .from(payments)
    .where(eq(payments.userId, userId))
    .orderBy(desc(payments.createdAt))
    .limit(8);

  const handle = profile?.handle || null;
  const isPremium = !!subscriptionState.isPremium;
  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      templateId: user.templateId,
      siteStatus: user.siteStatus,
      pauseReason: user.pauseReason,
      onboardingCompletedAt: user.onboardingCompletedAt,
    },
    profile: profile
      ? {
          handle: profile.handle,
          headline: profile.headline,
          isPremium: profile.isPremium,
          templateId: profile.templateId,
        }
      : null,
    subscription: sub || null,
    subscriptionState,
    urls: handle
      ? {
          pathUrl: pathPortfolioUrl(handle),
          subdomainUrl: portfolioPublicUrl(handle),
          recommendedUrl: isPremium ? portfolioPublicUrl(handle) : pathPortfolioUrl(handle),
        }
      : { pathUrl: null, subdomainUrl: null, recommendedUrl: null },
    recentPayments,
  };
}

export function registerAdminSupport(router: IRouter) {
  // Lookup by phone or email for call-desk flow
  router.get(
    "/support/users/lookup",
    staffGuard(["super_admin", "support"]),
    async (req: StaffRequest, res: Response) => {
      try {
        const q = String(req.query.q || "").trim();
        if (q.length < 3) {
          res.status(400).json({ error: "Enter at least 3 characters (phone or email)." });
          return;
        }

        const digits = normalizePhoneDigits(q);
        const looksEmail = q.includes("@");
        const conditions = [];
        if (looksEmail) {
          conditions.push(ilike(users.email, `%${q}%`));
        }
        if (digits.length >= 7) {
          conditions.push(sql`regexp_replace(${users.phone}, '\\D', '', 'g') LIKE ${`%${digits}%`}`);
        }
        if (!conditions.length) {
          conditions.push(ilike(users.email, `%${q}%`));
          conditions.push(ilike(users.phone, `%${q}%`));
          conditions.push(ilike(users.name, `%${q}%`));
        }

        const rows = await db
          .select({
            id: users.id,
            name: users.name,
            email: users.email,
            phone: users.phone,
            templateId: users.templateId,
            siteStatus: users.siteStatus,
            handle: profiles.handle,
            isPremium: profiles.isPremium,
          })
          .from(users)
          .leftJoin(profiles, eq(profiles.userId, users.id))
          .where(or(...conditions))
          .orderBy(desc(users.createdAt))
          .limit(20);

        res.json({ users: rows });
      } catch (err) {
        res.status(500).json({ error: (err as Error).message });
      }
    },
  );

  router.get(
    "/support/users/:userId/assist",
    staffGuard(["super_admin", "support"]),
    async (req: StaffRequest, res: Response) => {
      try {
        const data = await loadAssistUser(String(req.params.userId));
        if (!data) {
          res.status(404).json({ error: "User not found" });
          return;
        }
        const openTickets = await db
          .select({
            id: supportTickets.id,
            ticketNumber: supportTickets.ticketNumber,
            subject: supportTickets.subject,
            status: supportTickets.status,
            createdAt: supportTickets.createdAt,
          })
          .from(supportTickets)
          .where(
            and(
              eq(supportTickets.userId, data.user.id),
              sql`${supportTickets.status} IN ('open', 'in_progress')`,
            ),
          )
          .orderBy(desc(supportTickets.createdAt))
          .limit(10);
        res.json({ ...data, openTickets });
      } catch (err) {
        res.status(500).json({ error: (err as Error).message });
      }
    },
  );

  router.get(
    "/support/tickets",
    staffGuard(["super_admin", "support", "ops", "billing"]),
    async (req: StaffRequest, res: Response) => {
      try {
        const status = String(req.query.status || "").trim();
        const q = String(req.query.q || "").trim();
        const limit = Math.min(Number(req.query.limit) || 50, 200);

        const filters = [];
        if (status && isTicketStatus(status)) {
          filters.push(eq(supportTickets.status, status));
        }
        if (q) {
          filters.push(
            or(
              ilike(supportTickets.ticketNumber, `%${q}%`),
              ilike(supportTickets.subject, `%${q}%`),
              ilike(users.email, `%${q}%`),
              ilike(users.phone, `%${q}%`),
              ilike(users.name, `%${q}%`),
            )!,
          );
        }

        const rows = await db
          .select({
            id: supportTickets.id,
            ticketNumber: supportTickets.ticketNumber,
            userId: supportTickets.userId,
            subject: supportTickets.subject,
            status: supportTickets.status,
            priority: supportTickets.priority,
            channel: supportTickets.channel,
            createdAt: supportTickets.createdAt,
            updatedAt: supportTickets.updatedAt,
            userName: users.name,
            userEmail: users.email,
            userPhone: users.phone,
            handle: profiles.handle,
            assigneeName: staffUsers.name,
            assigneeEmail: staffUsers.email,
          })
          .from(supportTickets)
          .innerJoin(users, eq(users.id, supportTickets.userId))
          .leftJoin(profiles, eq(profiles.userId, supportTickets.userId))
          .leftJoin(staffUsers, eq(staffUsers.id, supportTickets.assigneeStaffId))
          .where(filters.length ? and(...filters) : undefined)
          .orderBy(desc(supportTickets.createdAt))
          .limit(limit);

        res.json({ tickets: rows });
      } catch (err) {
        res.status(500).json({ error: (err as Error).message });
      }
    },
  );

  router.post(
    "/support/tickets",
    staffGuard(["super_admin", "support"]),
    async (req: StaffRequest, res: Response) => {
      try {
        const userId = String(req.body?.userId || "").trim();
        const subject = String(req.body?.subject || "").trim();
        const description = String(req.body?.description || "").trim();
        const channelRaw = String(req.body?.channel || "phone").trim().toLowerCase();
        const priorityRaw = String(req.body?.priority || "normal").trim().toLowerCase();

        if (!userId) {
          res.status(400).json({ error: "userId is required" });
          return;
        }
        if (subject.length < 3) {
          res.status(400).json({ error: "Subject must be at least 3 characters" });
          return;
        }
        if (description.length < 5) {
          res.status(400).json({ error: "Description must be at least 5 characters" });
          return;
        }
        if (!isTicketChannel(channelRaw)) {
          res.status(400).json({ error: "channel must be phone | email | other" });
          return;
        }
        if (!isTicketPriority(priorityRaw)) {
          res.status(400).json({ error: "priority must be low | normal | high" });
          return;
        }

        const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
        if (!user) {
          res.status(404).json({ error: "User not found" });
          return;
        }
        if (!user.email) {
          res.status(409).json({ error: "User has no email on file — cannot send ticket confirmation." });
          return;
        }

        const ticketNumber = await allocateTicketNumber();
        const [ticket] = await db
          .insert(supportTickets)
          .values({
            ticketNumber,
            userId,
            createdByStaffId: req.staff!.id,
            assigneeStaffId: req.staff!.id,
            channel: channelRaw,
            subject,
            description,
            status: "open",
            priority: priorityRaw,
            requesterEmail: user.email,
            requesterPhone: user.phone,
          })
          .returning();

        await db.insert(supportTicketEvents).values({
          ticketId: ticket.id,
          actorStaffId: req.staff!.id,
          eventType: "created",
          visibility: "customer",
          body: description,
          toStatus: "open",
          meta: { channel: channelRaw, priority: priorityRaw },
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

        await audit(req, "support.ticket_create", "support_ticket", ticket.id, {
          ticketNumber,
          userId,
          channel: channelRaw,
        });

        res.status(201).json({ ticket });
      } catch (err) {
        res.status(500).json({ error: (err as Error).message });
      }
    },
  );

  router.get(
    "/support/tickets/:id",
    staffGuard(["super_admin", "support", "ops", "billing"]),
    async (req: StaffRequest, res: Response) => {
      try {
        const id = String(req.params.id);
        const [ticket] = await db.select().from(supportTickets).where(eq(supportTickets.id, id)).limit(1);
        if (!ticket) {
          res.status(404).json({ error: "Ticket not found" });
          return;
        }
        const assist = await loadAssistUser(ticket.userId);
        const events = await db
          .select({
            id: supportTicketEvents.id,
            eventType: supportTicketEvents.eventType,
            visibility: supportTicketEvents.visibility,
            body: supportTicketEvents.body,
            fromStatus: supportTicketEvents.fromStatus,
            toStatus: supportTicketEvents.toStatus,
            meta: supportTicketEvents.meta,
            createdAt: supportTicketEvents.createdAt,
            actorName: staffUsers.name,
            actorEmail: staffUsers.email,
          })
          .from(supportTicketEvents)
          .leftJoin(staffUsers, eq(staffUsers.id, supportTicketEvents.actorStaffId))
          .where(eq(supportTicketEvents.ticketId, id))
          .orderBy(asc(supportTicketEvents.createdAt));

        res.json({ ticket, events, user: assist });
      } catch (err) {
        res.status(500).json({ error: (err as Error).message });
      }
    },
  );

  router.patch(
    "/support/tickets/:id",
    staffGuard(["super_admin", "support"]),
    async (req: StaffRequest, res: Response) => {
      try {
        const id = String(req.params.id);
        const [ticket] = await db.select().from(supportTickets).where(eq(supportTickets.id, id)).limit(1);
        if (!ticket) {
          res.status(404).json({ error: "Ticket not found" });
          return;
        }

        const patch: Record<string, unknown> = { updatedAt: new Date() };
        let statusChanged: string | null = null;
        let assigneeChanged = false;

        if (req.body?.status !== undefined) {
          const next = String(req.body.status).trim().toLowerCase();
          if (!isTicketStatus(next)) {
            res.status(400).json({ error: "Invalid status" });
            return;
          }
          if (next !== ticket.status) {
            patch.status = next;
            statusChanged = next;
            if (next === "resolved") patch.resolvedAt = new Date();
            if (next === "closed") patch.closedAt = new Date();
            if (next === "open" || next === "in_progress") {
              patch.closedAt = null;
              if (next === "open") patch.resolvedAt = null;
            }
          }
        }

        if (req.body?.priority !== undefined) {
          const p = String(req.body.priority).trim().toLowerCase();
          if (!isTicketPriority(p)) {
            res.status(400).json({ error: "Invalid priority" });
            return;
          }
          patch.priority = p;
        }

        if (req.body?.assigneeStaffId !== undefined) {
          const assignee = req.body.assigneeStaffId
            ? String(req.body.assigneeStaffId).trim()
            : null;
          patch.assigneeStaffId = assignee;
          assigneeChanged = true;
        }

        const [updated] = await db
          .update(supportTickets)
          .set(patch)
          .where(eq(supportTickets.id, id))
          .returning();

        if (statusChanged) {
          const note = String(req.body?.note || "").trim();
          await db.insert(supportTicketEvents).values({
            ticketId: id,
            actorStaffId: req.staff!.id,
            eventType: "status_change",
            visibility: "customer",
            body: note || `Status changed to ${statusLabel(statusChanged)}`,
            fromStatus: ticket.status,
            toStatus: statusChanged,
          });

          const [user] = await db.select().from(users).where(eq(users.id, ticket.userId)).limit(1);
          if (user?.email) {
            await enqueueEmail({
              eventType: "support_ticket_updated",
              recipient: user.email,
              subject: `[${ticket.ticketNumber}] Status: ${statusLabel(statusChanged)}`,
              dedupeKey: `support_ticket_updated:${id}:${statusChanged}:${Date.now()}`,
              userId: user.id,
              relatedId: id,
              payload: {
                userName: user.name || "there",
                ticketNumber: ticket.ticketNumber,
                status: statusChanged,
                statusLabel: statusLabel(statusChanged),
                subject: ticket.subject,
                note: note || undefined,
              },
            });
          }

          await audit(req, "support.ticket_status", "support_ticket", id, {
            from: ticket.status,
            to: statusChanged,
          });
        }

        if (assigneeChanged) {
          await db.insert(supportTicketEvents).values({
            ticketId: id,
            actorStaffId: req.staff!.id,
            eventType: "assignment",
            visibility: "internal",
            body: updated.assigneeStaffId
              ? `Assigned to staff ${updated.assigneeStaffId}`
              : "Unassigned",
            meta: { assigneeStaffId: updated.assigneeStaffId },
          });
        }

        res.json({ ticket: updated });
      } catch (err) {
        res.status(500).json({ error: (err as Error).message });
      }
    },
  );

  router.post(
    "/support/tickets/:id/events",
    staffGuard(["super_admin", "support"]),
    async (req: StaffRequest, res: Response) => {
      try {
        const id = String(req.params.id);
        const body = String(req.body?.body || "").trim();
        const visibility = String(req.body?.visibility || "internal").trim().toLowerCase();
        if (body.length < 2) {
          res.status(400).json({ error: "Note body is required" });
          return;
        }
        if (visibility !== "internal" && visibility !== "customer") {
          res.status(400).json({ error: "visibility must be internal | customer" });
          return;
        }

        const [ticket] = await db.select().from(supportTickets).where(eq(supportTickets.id, id)).limit(1);
        if (!ticket) {
          res.status(404).json({ error: "Ticket not found" });
          return;
        }

        const eventType = visibility === "customer" ? "reply" : "note";
        const [event] = await db
          .insert(supportTicketEvents)
          .values({
            ticketId: id,
            actorStaffId: req.staff!.id,
            eventType,
            visibility,
            body,
          })
          .returning();

        await db
          .update(supportTickets)
          .set({ updatedAt: new Date() })
          .where(eq(supportTickets.id, id));

        if (visibility === "customer") {
          const [user] = await db.select().from(users).where(eq(users.id, ticket.userId)).limit(1);
          if (user?.email) {
            await enqueueEmail({
              eventType: "support_ticket_reply",
              recipient: user.email,
              subject: `[${ticket.ticketNumber}] Reply from BEXO Support`,
              dedupeKey: `support_ticket_reply:${event.id}`,
              userId: user.id,
              relatedId: id,
              payload: {
                userName: user.name || "there",
                ticketNumber: ticket.ticketNumber,
                subject: ticket.subject,
                body,
              },
            });
          }
        }

        await audit(req, "support.ticket_note", "support_ticket", id, {
          visibility,
          eventType,
        });

        res.status(201).json({ event });
      } catch (err) {
        res.status(500).json({ error: (err as Error).message });
      }
    },
  );
}
