import { createHash } from "node:crypto";
import { Router, type Response } from "express";
import { desc, eq } from "drizzle-orm";
import { db, marketingLeads } from "@workspace/db";
import { staffGuard, type StaffRequest } from "../middlewares/staffAuth";
import { logger } from "../lib/logger";

const router = Router();

function clientIp(req: any): string {
  const xf = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return xf || req.ip || "";
}

function ipHash(ip: string): string | null {
  if (!ip) return null;
  return createHash("sha256").update(ip).digest("hex").slice(0, 32);
}

/** Public Contact Us form from the marketing site. */
router.post("/contact", async (req: any, res: Response) => {
  try {
    // Honeypot — bots fill hidden fields; humans leave empty.
    if (String(req.body?.website || req.body?.company_url || "").trim()) {
      return res.json({ ok: true });
    }

    const name = String(req.body?.name || "").trim().slice(0, 120);
    const email = String(req.body?.email || "").trim().toLowerCase().slice(0, 200);
    const phone = String(req.body?.phone || "").trim().slice(0, 40) || null;
    const subject = String(req.body?.subject || "").trim().slice(0, 160) || null;
    const message = String(req.body?.message || "").trim().slice(0, 4000);
    const pageUrl = String(req.body?.pageUrl || req.body?.page_url || "").trim().slice(0, 500) || null;
    const source = String(req.body?.source || "marketing_contact").trim().slice(0, 80) || "marketing_contact";

    if (name.length < 2) return res.status(400).json({ error: "Please enter your name." });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "Please enter a valid email." });
    }
    if (message.length < 10) {
      return res.status(400).json({ error: "Please write a bit more in your message." });
    }

    const [lead] = await db
      .insert(marketingLeads)
      .values({
        name,
        email,
        phone,
        subject,
        message,
        source,
        pageUrl,
        status: "new",
        ipHash: ipHash(clientIp(req)),
      })
      .returning({ id: marketingLeads.id });

    logger.info({ leadId: lead?.id, email, source }, "Marketing contact lead created");
    return res.status(201).json({ ok: true, id: lead?.id });
  } catch (err) {
    logger.error({ err }, "Marketing contact submit failed");
    return res.status(500).json({ error: "Could not send your message. Please try again." });
  }
});

export default router;

/** Staff CRM list/update — mounted under /api/admin */
export function registerAdminMarketingLeads(router: Router) {
  router.get(
    "/leads",
    staffGuard(["super_admin", "support", "ops", "billing"]),
    async (req: StaffRequest, res: Response) => {
      try {
        const status = String(req.query.status || "").trim();
        const rows = status
          ? await db
              .select()
              .from(marketingLeads)
              .where(eq(marketingLeads.status, status))
              .orderBy(desc(marketingLeads.createdAt))
              .limit(200)
          : await db.select().from(marketingLeads).orderBy(desc(marketingLeads.createdAt)).limit(200);
        res.json({ leads: rows });
      } catch (err) {
        res.status(500).json({ error: (err as Error).message });
      }
    },
  );

  router.patch(
    "/leads/:id",
    staffGuard(["super_admin", "support", "ops", "billing"]),
    async (req: StaffRequest, res: Response) => {
      try {
        const id = String(req.params.id || "");
        const status = req.body?.status != null ? String(req.body.status).trim() : undefined;
        const notes = req.body?.notes != null ? String(req.body.notes) : undefined;
        const allowed = ["new", "contacted", "qualified", "closed", "spam"];
        if (status && !allowed.includes(status)) {
          res.status(400).json({ error: "Invalid status" });
          return;
        }
        const patch: Record<string, any> = { updatedAt: new Date() };
        if (status) patch.status = status;
        if (notes !== undefined) patch.notes = notes;
        if (req.staff?.id) patch.assignedStaffId = req.staff.id;

        const [row] = await db
          .update(marketingLeads)
          .set(patch)
          .where(eq(marketingLeads.id, id))
          .returning();
        if (!row) {
          res.status(404).json({ error: "Lead not found" });
          return;
        }
        res.json({ lead: row });
      } catch (err) {
        res.status(500).json({ error: (err as Error).message });
      }
    },
  );
}
