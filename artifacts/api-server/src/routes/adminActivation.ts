/**
 * Admin activation code engine routes.
 */
import { type IRouter, type Response } from "express";
import { desc, eq } from "drizzle-orm";
import { activationBatches, adminAuditLog, db } from "@workspace/db";
import { staffGuard, type StaffRequest } from "../middlewares/staffAuth";
import { logger } from "../lib/logger";
import {
  createEmailLinkedBatch,
  createOrganization,
  issueEmailLinkedCode,
  issueGeneralCodes,
  listActivationKeys,
  listOrganizations,
  orgActivationStats,
  parseEmailRoster,
  processActivationBatch,
  revokeActivationKey,
} from "../lib/activationEngine";

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

export function registerAdminActivation(router: IRouter) {
  const roles = ["super_admin", "billing", "ops"] as const;

  router.get("/activation/organizations", staffGuard([...roles, "support"]), async (_req, res: Response) => {
    try {
      const orgs = await listOrganizations();
      res.json({ organizations: orgs });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  router.post("/activation/organizations", staffGuard([...roles]), async (req: StaffRequest, res: Response) => {
    try {
      const name = String(req.body?.name || "").trim();
      const slug = String(req.body?.slug || "").trim();
      if (!name || !slug) {
        res.status(400).json({ error: "name and slug required" });
        return;
      }
      const domains = Array.isArray(req.body?.emailDomains)
        ? req.body.emailDomains.map(String)
        : String(req.body?.emailDomains || "")
            .split(/[\s,]+/)
            .filter(Boolean);
      const org = await createOrganization({
        name,
        slug,
        emailDomains: domains,
        notes: req.body?.notes ? String(req.body.notes) : undefined,
      });
      await audit(req, "activation.org.create", "organization", org!.id, { slug: org!.slug });
      res.json({ organization: org });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  router.get("/activation/stats", staffGuard([...roles, "support"]), async (req, res: Response) => {
    try {
      const organizationId = req.query.organizationId
        ? String(req.query.organizationId)
        : undefined;
      const stats = await orgActivationStats(organizationId);
      res.json({ stats });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  router.get("/activation/keys", staffGuard([...roles, "support"]), async (req: StaffRequest, res: Response) => {
    try {
      const result = await listActivationKeys({
        organizationId: req.query.organizationId ? String(req.query.organizationId) : undefined,
        batchId: req.query.batchId ? String(req.query.batchId) : undefined,
        status: req.query.status ? String(req.query.status) : undefined,
        plan: req.query.plan ? String(req.query.plan) : undefined,
        binding:
          req.query.binding === "general" || req.query.binding === "email_linked"
            ? req.query.binding
            : undefined,
        q: req.query.q ? String(req.query.q) : undefined,
        limit: req.query.limit ? Number(req.query.limit) : 50,
        offset: req.query.offset ? Number(req.query.offset) : 0,
      });
      // Support can see inventory status but not plaintext unused codes.
      const role = req.staff?.role;
      if (role === "support" && Array.isArray(result.rows)) {
        result.rows = result.rows.map((row: any) => {
          const code = String(row?.key?.code || "");
          const status = String(row?.key?.status || "");
          const masked =
            status === "unused" && code.length > 4
              ? `${code.slice(0, 3)}••••${code.slice(-2)}`
              : code;
          return { ...row, key: { ...row.key, code: masked, codeMasked: true } };
        });
      }
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  router.get("/activation/batches", staffGuard([...roles, "support"]), async (req, res: Response) => {
    try {
      const organizationId = req.query.organizationId
        ? String(req.query.organizationId)
        : undefined;
      const rows = organizationId
        ? await db
            .select()
            .from(activationBatches)
            .where(eq(activationBatches.organizationId, organizationId))
            .orderBy(desc(activationBatches.createdAt))
            .limit(100)
        : await db
            .select()
            .from(activationBatches)
            .orderBy(desc(activationBatches.createdAt))
            .limit(100);
      res.json({ batches: rows });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  router.post("/activation/generate-general", staffGuard([...roles]), async (req: StaffRequest, res: Response) => {
    try {
      const count = Number(req.body?.count || 0);
      if (!count || count < 1) {
        res.status(400).json({ error: "count must be >= 1" });
        return;
      }
      const result = await issueGeneralCodes({
        count,
        plan: req.body?.plan,
        organizationId: req.body?.organizationId || null,
        label: req.body?.label ? String(req.body.label) : undefined,
        expiresAt: req.body?.expiresAt ? new Date(req.body.expiresAt) : null,
        staffId: req.staff?.id || null,
      });
      await audit(req, "activation.generate_general", "activation_batch", result.batch!.id, {
        count: result.codes.length,
        plan: result.plan,
      });
      res.json({
        batch: result.batch,
        plan: result.plan,
        codes: result.codes,
        count: result.codes.length,
      });
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  router.post("/activation/generate-email", staffGuard([...roles]), async (req: StaffRequest, res: Response) => {
    try {
      const result = await issueEmailLinkedCode({
        email: String(req.body?.email || ""),
        name: req.body?.name ? String(req.body.name) : null,
        plan: req.body?.plan,
        organizationId: req.body?.organizationId || null,
        expiresAt: req.body?.expiresAt ? new Date(req.body.expiresAt) : null,
        staffId: req.staff?.id || null,
        sendEmail: req.body?.sendEmail !== false,
      });
      await audit(req, "activation.generate_email", "activation_key", result.key!.id, {
        email: result.key!.boundEmail,
        plan: result.plan,
      });
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  router.post("/activation/upload-roster", staffGuard([...roles]), async (req: StaffRequest, res: Response) => {
    try {
      const organizationId = String(req.body?.organizationId || "");
      if (!organizationId) {
        res.status(400).json({ error: "organizationId required" });
        return;
      }
      const raw = String(req.body?.csv || req.body?.text || "");
      const rows = parseEmailRoster(raw);
      if (!rows.length) {
        res.status(400).json({
          error: "No valid emails found. Upload CSV/Excel-as-CSV with an email column.",
        });
        return;
      }

      const { batch, rows: issuanceRows, defaultPlan } = await createEmailLinkedBatch({
        organizationId,
        label: String(req.body?.label || `Roster ${new Date().toISOString().slice(0, 10)}`),
        rows,
        defaultPlan: req.body?.defaultPlan || "essential",
        expiresAt: req.body?.expiresAt ? new Date(req.body.expiresAt) : null,
        staffId: req.staff?.id || null,
      });

      await audit(req, "activation.upload_roster", "activation_batch", batch.id, {
        rows: issuanceRows.length,
        defaultPlan,
      });

      // Process async so HTTP returns quickly for large files
      const run = async () => {
        try {
          await processActivationBatch(batch.id, issuanceRows);
        } catch (err) {
          logger.error({ err, batchId: batch.id }, "activation batch processing failed");
        }
      };
      if (issuanceRows.length <= 50) {
        const stats = await processActivationBatch(batch.id, issuanceRows);
        res.json({ batchId: batch.id, batch, ...stats, defaultPlan, async: false });
      } else {
        void run();
        res.json({
          batchId: batch.id,
          batch,
          defaultPlan,
          async: true,
          message: `Processing ${issuanceRows.length} emails in the background. Refresh batches to track progress.`,
        });
      }
    } catch (err) {
      res.status(400).json({ error: (err as Error).message });
    }
  });

  router.post(
    "/activation/keys/:keyId/revoke",
    staffGuard([...roles]),
    async (req: StaffRequest, res: Response) => {
      try {
        const key = await revokeActivationKey(String(req.params.keyId), req.staff?.id);
        await audit(req, "activation.revoke", "activation_key", key.id, { code: key.code });
        res.json({ key });
      } catch (err) {
        res.status(400).json({ error: (err as Error).message });
      }
    },
  );
}
