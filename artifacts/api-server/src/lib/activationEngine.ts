/**
 * Activation code engine — unique codes, org batches, email-linked redeem.
 */
import { randomBytes } from "node:crypto";
import { and, count, desc, eq, ilike, or, sql } from "drizzle-orm";
import {
  activationBatches,
  activationKeys,
  db,
  organizations,
  payments,
  users,
} from "@workspace/db";
import { enqueueEmail, processEmailOutbox } from "./emailOutbox";
import { logger } from "./logger";
import {
  activatePaidPlan,
  getRenewalExpiry,
  isPaidPlan,
  normalizePlanId,
  type PaidPlan,
} from "./subscriptions";
import { getPlanById, loadPricingCatalog } from "./pricingCatalog";
import { appOrigin } from "./platform";
import { recordLedgerEvent } from "./billingEngine";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I/O/0/1
export const DEFAULT_ACTIVATION_PLAN: PaidPlan = "essential";
export type BindingMode = "general" | "email_linked";
export type ActivationPlanId = PaidPlan;

export type IssuanceRow = {
  email?: string | null;
  name?: string | null;
  plan?: string | null;
};

function segment(len = 4): string {
  const buf = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) {
    out += ALPHABET[buf[i]! % ALPHABET.length];
  }
  return out;
}

export function normalizeEmail(raw: unknown): string | null {
  if (!raw || typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

export function normalizeOrgSlug(raw: string): string {
  return String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 12) || "BEXO";
}

export function resolveActivationPlan(raw?: string | null): PaidPlan {
  const normalized = normalizePlanId(raw || DEFAULT_ACTIVATION_PLAN);
  if (normalized && isPaidPlan(normalized)) return normalized;
  return DEFAULT_ACTIVATION_PLAN;
}

export async function generateUniqueCode(prefix: string, attempts = 12): Promise<string> {
  const slug = normalizeOrgSlug(prefix);
  for (let i = 0; i < attempts; i++) {
    const code = `${slug}-${segment(4)}-${segment(4)}-${segment(4)}`;
    const [existing] = await db
      .select({ id: activationKeys.id })
      .from(activationKeys)
      .where(eq(activationKeys.code, code))
      .limit(1);
    if (!existing) return code;
  }
  throw new Error("Unable to allocate a unique activation code. Retry.");
}

async function planFeatureLines(plan: PaidPlan): Promise<string[]> {
  try {
    const catalog = await loadPricingCatalog();
    const row = catalog.plans.find((p) => p.id === plan) || (await getPlanById(plan));
    if (row?.features?.length) return row.features.slice(0, 6).map(String);
  } catch {
    /* fallback below */
  }
  const fallback: Record<PaidPlan, string[]> = {
    identity: ["Custom subdomain", "Premium templates", "50MB storage", "Hire Me page"],
    essential: [
      "Everything in Identity",
      "100MB storage",
      "More resume parses",
      "Exclusive templates",
    ],
    growth: ["Everything in Essential", "Billed yearly", "Placement-season ready"],
    studentplus: ["Everything in Identity", "One-time payment", "Lifetime access"],
  };
  return fallback[plan] || fallback.essential;
}

export async function enqueueActivationCodeEmail(opts: {
  keyId: string;
  code: string;
  plan: PaidPlan;
  recipientEmail: string;
  recipientName?: string | null;
  organizationName?: string | null;
}) {
  const features = await planFeatureLines(opts.plan);
  const planRow = await getPlanById(opts.plan).catch(() => null);
  const queued = await enqueueEmail({
    eventType: "activation_code_issued",
    recipient: opts.recipientEmail,
    subject: `Your BEXO ${planRow?.displayName || opts.plan} activation code`,
    dedupeKey: `activation_code_issued:${opts.keyId}`,
    relatedId: opts.keyId,
    payload: {
      userName: opts.recipientName || "there",
      code: opts.code,
      plan: opts.plan,
      planLabel: planRow?.displayName || opts.plan,
      features,
      organizationName: opts.organizationName || "",
      redeemUrl: `${appOrigin()}/billing`,
    },
  });
  if (queued) {
    await db
      .update(activationKeys)
      .set({
        emailDeliveryId: queued.id,
        emailedAt: new Date(),
      })
      .where(eq(activationKeys.id, opts.keyId));
  }
  return queued;
}

export async function createOrganization(input: {
  name: string;
  slug: string;
  emailDomains?: string[];
  notes?: string;
}) {
  const slug = normalizeOrgSlug(input.slug);
  const [row] = await db
    .insert(organizations)
    .values({
      name: input.name.trim(),
      slug,
      emailDomains: (input.emailDomains || []).map((d) =>
        String(d).trim().toLowerCase().replace(/^@/, ""),
      ),
      notes: input.notes || null,
    })
    .returning();
  return row;
}

export async function listOrganizations() {
  return db.select().from(organizations).orderBy(desc(organizations.createdAt));
}

async function insertKeyWithRetry(values: typeof activationKeys.$inferInsert) {
  for (let i = 0; i < 8; i++) {
    try {
      const [row] = await db.insert(activationKeys).values(values).returning();
      return row;
    } catch (err: any) {
      const msg = String(err?.message || err);
      if (msg.includes("unique") || msg.includes("duplicate")) {
        values = {
          ...values,
          code: await generateUniqueCode(
            String(values.code || "BEXO").split("-")[0] || "BEXO",
          ),
        };
        continue;
      }
      throw err;
    }
  }
  throw new Error("Failed to insert activation key after retries");
}

export async function issueGeneralCodes(opts: {
  count: number;
  plan?: string | null;
  organizationId?: string | null;
  label?: string;
  expiresAt?: Date | null;
  staffId?: string | null;
  sendEmails?: never;
}) {
  const n = Math.min(Math.max(1, Math.floor(opts.count)), 5000);
  const plan = resolveActivationPlan(opts.plan);
  let orgSlug = "BEXO";
  let orgName: string | null = null;
  if (opts.organizationId) {
    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, opts.organizationId))
      .limit(1);
    if (org) {
      orgSlug = org.slug;
      orgName = org.name;
    }
  }

  const [batch] = await db
    .insert(activationBatches)
    .values({
      organizationId: opts.organizationId || null,
      label: opts.label || `General × ${n} (${plan})`,
      defaultPlan: plan,
      bindingMode: "general",
      status: "processing",
      totalRows: n,
      createdByStaffId: opts.staffId || null,
      expiresAt: opts.expiresAt || null,
    })
    .returning();

  const codes: string[] = [];
  let created = 0;
  for (let i = 0; i < n; i++) {
    const code = await generateUniqueCode(orgSlug);
    await insertKeyWithRetry({
      code,
      status: "unused",
      plan,
      organizationId: opts.organizationId || null,
      batchId: batch!.id,
      boundEmail: null,
      expiresAt: opts.expiresAt || null,
      createdByStaffId: opts.staffId || null,
    });
    codes.push(code);
    created += 1;
  }

  await db
    .update(activationBatches)
    .set({
      status: "completed",
      createdCount: created,
      updatedAt: new Date(),
      completedAt: new Date(),
    })
    .where(eq(activationBatches.id, batch!.id));

  return { batch, codes, organizationName: orgName, plan };
}

export async function issueEmailLinkedCode(opts: {
  email: string;
  name?: string | null;
  plan?: string | null;
  organizationId?: string | null;
  expiresAt?: Date | null;
  staffId?: string | null;
  sendEmail?: boolean;
}) {
  const email = normalizeEmail(opts.email);
  if (!email) throw new Error("Valid email is required for email-linked codes");
  const plan = resolveActivationPlan(opts.plan);
  let orgSlug = "BEXO";
  let orgName: string | null = null;
  if (opts.organizationId) {
    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, opts.organizationId))
      .limit(1);
    if (org) {
      orgSlug = org.slug;
      orgName = org.name;
    }
  }

  const [batch] = await db
    .insert(activationBatches)
    .values({
      organizationId: opts.organizationId || null,
      label: opts.name ? `Single · ${opts.name}` : `Single · ${email}`,
      defaultPlan: plan,
      bindingMode: "email_linked",
      status: "processing",
      totalRows: 1,
      createdByStaffId: opts.staffId || null,
      expiresAt: opts.expiresAt || null,
    })
    .returning();

  const code = await generateUniqueCode(orgSlug);
  const key = await insertKeyWithRetry({
    code,
    status: "unused",
    plan,
    organizationId: opts.organizationId || null,
    batchId: batch!.id,
    boundEmail: email,
    recipientName: opts.name || null,
    expiresAt: opts.expiresAt || null,
    createdByStaffId: opts.staffId || null,
  });

  let emailed = false;
  if (opts.sendEmail !== false) {
    const q = await enqueueActivationCodeEmail({
      keyId: key!.id,
      code,
      plan,
      recipientEmail: email,
      recipientName: opts.name,
      organizationName: orgName,
    });
    emailed = !!q;
  }

  await db
    .update(activationBatches)
    .set({
      status: "completed",
      createdCount: 1,
      emailedCount: emailed ? 1 : 0,
      updatedAt: new Date(),
      completedAt: new Date(),
    })
    .where(eq(activationBatches.id, batch!.id));

  void processEmailOutbox(5).catch(() => undefined);
  return { batch, key, code, plan, emailed };
}

/** Parse CSV or TSV paste / Excel-exported text into issuance rows. */
export function parseEmailRoster(raw: string): IssuanceRow[] {
  const text = String(raw || "").replace(/^\uFEFF/, "");
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return [];

  const split = (line: string) => {
    if (line.includes("\t")) return line.split("\t").map((c) => c.trim());
    // simple CSV (handles quoted commas lightly)
    const cells: string[] = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]!;
      if (ch === '"') {
        inQ = !inQ;
        continue;
      }
      if (ch === "," && !inQ) {
        cells.push(cur.trim());
        cur = "";
        continue;
      }
      cur += ch;
    }
    cells.push(cur.trim());
    return cells;
  };

  const header = split(lines[0]!).map((h) => h.toLowerCase());
  const hasHeader =
    header.includes("email") ||
    header.includes("e-mail") ||
    header.includes("mail");

  const rows: IssuanceRow[] = [];
  const start = hasHeader ? 1 : 0;
  const emailIdx = hasHeader
    ? Math.max(
        0,
        header.findIndex((h) => h === "email" || h === "e-mail" || h === "mail"),
      )
    : 0;
  const nameIdx = hasHeader ? header.findIndex((h) => h === "name" || h === "student") : 1;
  const planIdx = hasHeader ? header.findIndex((h) => h === "plan") : 2;

  for (let i = start; i < lines.length; i++) {
    const cells = split(lines[i]!);
    const email = normalizeEmail(cells[emailIdx] || cells[0]);
    if (!email) continue;
    rows.push({
      email,
      name: nameIdx >= 0 ? cells[nameIdx] || null : null,
      plan: planIdx >= 0 ? cells[planIdx] || null : null,
    });
  }
  return rows;
}

export async function createEmailLinkedBatch(opts: {
  organizationId: string;
  label: string;
  rows: IssuanceRow[];
  defaultPlan?: string | null;
  expiresAt?: Date | null;
  staffId?: string | null;
}) {
  const rows = opts.rows.filter((r) => normalizeEmail(r.email));
  if (!rows.length) throw new Error("No valid emails in upload");
  if (rows.length > 20000) throw new Error("Max 20,000 emails per batch");

  const plan = resolveActivationPlan(opts.defaultPlan);
  const [batch] = await db
    .insert(activationBatches)
    .values({
      organizationId: opts.organizationId,
      label: opts.label.trim() || `Campus batch ${new Date().toISOString().slice(0, 10)}`,
      defaultPlan: plan,
      bindingMode: "email_linked",
      status: "pending",
      totalRows: rows.length,
      createdByStaffId: opts.staffId || null,
      expiresAt: opts.expiresAt || null,
    })
    .returning();

  // Store rows temporarily in error_summary as JSON for worker (bounded).
  // For large batches we process immediately in processActivationBatch.
  return { batch: batch!, rows, defaultPlan: plan };
}

export async function processActivationBatch(
  batchId: string,
  rows: IssuanceRow[],
): Promise<{ created: number; emailed: number; failed: number }> {
  const [batch] = await db
    .select()
    .from(activationBatches)
    .where(eq(activationBatches.id, batchId))
    .limit(1);
  if (!batch) throw new Error("Batch not found");

  await db
    .update(activationBatches)
    .set({ status: "processing", updatedAt: new Date() })
    .where(eq(activationBatches.id, batchId));

  let orgSlug = "BEXO";
  let orgName: string | null = null;
  if (batch.organizationId) {
    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, batch.organizationId))
      .limit(1);
    if (org) {
      orgSlug = org.slug;
      orgName = org.name;
    }
  }

  let created = 0;
  let emailed = 0;
  let failed = 0;
  const errors: string[] = [];
  const CHUNK = 100;

  for (let offset = 0; offset < rows.length; offset += CHUNK) {
    const slice = rows.slice(offset, offset + CHUNK);
    for (const row of slice) {
      const email = normalizeEmail(row.email);
      if (!email) {
        failed += 1;
        continue;
      }
      const plan = resolveActivationPlan(row.plan || batch.defaultPlan);

      // Idempotent: skip if unused code already exists for this batch+email
      const [existing] = await db
        .select()
        .from(activationKeys)
        .where(
          and(
            eq(activationKeys.batchId, batchId),
            sql`lower(${activationKeys.boundEmail}) = ${email}`,
            eq(activationKeys.status, "unused"),
          ),
        )
        .limit(1);
      if (existing) {
        created += 1;
        if (!existing.emailedAt) {
          const q = await enqueueActivationCodeEmail({
            keyId: existing.id,
            code: existing.code,
            plan: resolveActivationPlan(existing.plan),
            recipientEmail: email,
            recipientName: row.name,
            organizationName: orgName,
          });
          if (q) emailed += 1;
        }
        continue;
      }

      try {
        const code = await generateUniqueCode(orgSlug);
        const key = await insertKeyWithRetry({
          code,
          status: "unused",
          plan,
          organizationId: batch.organizationId,
          batchId,
          boundEmail: email,
          recipientName: row.name || null,
          expiresAt: batch.expiresAt,
          createdByStaffId: batch.createdByStaffId,
        });
        created += 1;
        const q = await enqueueActivationCodeEmail({
          keyId: key!.id,
          code,
          plan,
          recipientEmail: email,
          recipientName: row.name,
          organizationName: orgName,
        });
        if (q) emailed += 1;
      } catch (err: any) {
        failed += 1;
        if (errors.length < 20) errors.push(`${email}: ${err?.message || err}`);
        logger.warn({ err, email, batchId }, "activation batch row failed");
      }
    }

    await db
      .update(activationBatches)
      .set({
        createdCount: created,
        emailedCount: emailed,
        failedCount: failed,
        updatedAt: new Date(),
      })
      .where(eq(activationBatches.id, batchId));

    await processEmailOutbox(40).catch(() => undefined);
  }

  await db
    .update(activationBatches)
    .set({
      status: failed && !created ? "failed" : "completed",
      createdCount: created,
      emailedCount: emailed,
      failedCount: failed,
      errorSummary: errors.length ? errors.join("\n") : null,
      updatedAt: new Date(),
      completedAt: new Date(),
    })
    .where(eq(activationBatches.id, batchId));

  return { created, emailed, failed };
}

export async function redeemActivationCode(opts: {
  userId: string;
  code: string;
}): Promise<{
  plan: PaidPlan;
  expiresAt: Date | null;
  storageQuotaBytes: number;
  organizationId: string | null;
  code: string;
}> {
  const code = String(opts.code || "").trim().toUpperCase();
  if (!code) throw Object.assign(new Error("Activation code is required."), { status: 400 });

  const [user] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.id, opts.userId))
    .limit(1);
  if (!user) throw Object.assign(new Error("Unauthorized"), { status: 401 });

  const [key] = await db
    .select()
    .from(activationKeys)
    .where(eq(activationKeys.code, code))
    .limit(1);

  if (!key) {
    throw Object.assign(new Error("Invalid activation code. Please check and try again."), {
      status: 400,
    });
  }
  if (key.status === "revoked") {
    throw Object.assign(new Error("This activation code has been revoked."), { status: 400 });
  }
  if (key.status === "expired" || (key.expiresAt && key.expiresAt.getTime() < Date.now())) {
    if (key.status !== "expired") {
      await db
        .update(activationKeys)
        .set({ status: "expired" })
        .where(eq(activationKeys.id, key.id));
    }
    throw Object.assign(new Error("This activation code has expired."), { status: 400 });
  }
  if (key.status !== "unused") {
    throw Object.assign(
      new Error("This activation code has already been used or is no longer active."),
      { status: 400 },
    );
  }

  if (key.boundEmail) {
    const userEmail = normalizeEmail(user.email);
    if (!userEmail) {
      throw Object.assign(
        new Error(
          "This code is linked to an email address. Add/sign in with Google using that email first.",
        ),
        { status: 400 },
      );
    }
    if (userEmail !== key.boundEmail.toLowerCase()) {
      throw Object.assign(
        new Error(
          "This code is linked to another email. Sign in with that email to activate your Premium.",
        ),
        { status: 403, code: "EMAIL_BOUND_MISMATCH" },
      );
    }
  }

  const plan = resolveActivationPlan(key.plan);

  const [redeemed] = await db
    .update(activationKeys)
    .set({
      status: "redeemed",
      redeemedBy: opts.userId,
      redeemedAt: new Date(),
    })
    .where(and(eq(activationKeys.id, key.id), eq(activationKeys.status, "unused")))
    .returning();

  if (!redeemed) {
    throw Object.assign(
      new Error("This activation code has already been used or is no longer active."),
      { status: 400 },
    );
  }

  if (key.batchId) {
    await db
      .update(activationBatches)
      .set({
        redeemedCount: sql`${activationBatches.redeemedCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(activationBatches.id, key.batchId));
  }

  const expiresAt = await getRenewalExpiry(opts.userId, plan);
  const activated = await activatePaidPlan(opts.userId, plan, expiresAt);

  const [payment] = await db
    .insert(payments)
    .values({
      userId: opts.userId,
      razorpayOrderId: `activation_${redeemed.id}`,
      razorpayPaymentId: code,
      amount: 0,
      status: "success",
      plan,
      kind: "activation",
    })
    .returning();

  await recordLedgerEvent({
    userId: opts.userId,
    paymentId: payment?.id,
    eventType: "activation_code_redeemed",
    amountPaise: 0,
    plan,
    idempotencyKey: `activation_redeemed:${redeemed.id}`,
    metadata: {
      code,
      organizationId: redeemed.organizationId,
      batchId: redeemed.batchId,
      boundEmail: redeemed.boundEmail,
    },
  }).catch(() => undefined);

  return {
    plan: activated.plan,
    expiresAt: activated.expiresAt,
    storageQuotaBytes: activated.storageQuotaBytes,
    organizationId: redeemed.organizationId,
    code,
  };
}

export async function listActivationKeys(filters: {
  organizationId?: string;
  batchId?: string;
  status?: string;
  plan?: string;
  binding?: "general" | "email_linked";
  q?: string;
  limit?: number;
  offset?: number;
}) {
  const limit = Math.min(Math.max(filters.limit || 50, 1), 200);
  const offset = Math.max(filters.offset || 0, 0);
  const clauses = [];
  if (filters.organizationId) clauses.push(eq(activationKeys.organizationId, filters.organizationId));
  if (filters.batchId) clauses.push(eq(activationKeys.batchId, filters.batchId));
  if (filters.status) clauses.push(eq(activationKeys.status, filters.status));
  if (filters.plan) clauses.push(eq(activationKeys.plan, filters.plan));
  if (filters.binding === "general") clauses.push(sql`${activationKeys.boundEmail} IS NULL`);
  if (filters.binding === "email_linked") clauses.push(sql`${activationKeys.boundEmail} IS NOT NULL`);
  if (filters.q) {
    const q = `%${filters.q.trim()}%`;
    clauses.push(
      or(
        ilike(activationKeys.code, q),
        ilike(activationKeys.boundEmail, q),
        ilike(activationKeys.recipientName, q),
      )!,
    );
  }

  const where = clauses.length ? and(...clauses) : undefined;
  const rows = await db
    .select({
      key: activationKeys,
      orgName: organizations.name,
      orgSlug: organizations.slug,
      batchLabel: activationBatches.label,
    })
    .from(activationKeys)
    .leftJoin(organizations, eq(activationKeys.organizationId, organizations.id))
    .leftJoin(activationBatches, eq(activationKeys.batchId, activationBatches.id))
    .where(where)
    .orderBy(desc(activationKeys.createdAt))
    .limit(limit)
    .offset(offset);

  const [totalRow] = await db
    .select({ c: count() })
    .from(activationKeys)
    .where(where);

  return { rows, total: Number(totalRow?.c || 0), limit, offset };
}

export async function orgActivationStats(organizationId?: string) {
  const where = organizationId
    ? eq(activationKeys.organizationId, organizationId)
    : undefined;
  const rows = await db
    .select({
      status: activationKeys.status,
      c: count(),
    })
    .from(activationKeys)
    .where(where)
    .groupBy(activationKeys.status);
  const out: Record<string, number> = {
    unused: 0,
    redeemed: 0,
    revoked: 0,
    expired: 0,
    total: 0,
  };
  for (const r of rows) {
    const s = r.status || "unused";
    out[s] = Number(r.c);
    out.total += Number(r.c);
  }
  return out;
}

export async function revokeActivationKey(keyId: string, staffId?: string | null) {
  const [row] = await db
    .update(activationKeys)
    .set({ status: "revoked" })
    .where(and(eq(activationKeys.id, keyId), eq(activationKeys.status, "unused")))
    .returning();
  if (!row) throw new Error("Only unused codes can be revoked");
  return row;
}
