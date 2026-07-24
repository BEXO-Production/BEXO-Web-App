/**
 * BEXO Billing Engine — integrated into api-server (not a separate microservice).
 *
 * Responsibilities:
 * - Hard Autopay mandate gate for coupon/bootstrap checkouts
 * - Delayed Autopay attach for cancelled renewals / activation-key users (subscription_enable)
 * - Append-only ledger for money + lifecycle events
 * - Webhook event idempotency
 * - Reconciliation + stale awaiting_mandate cleanup (daily job)
 */
import { db, billingLedger, payments, razorpayWebhookEvents, subscriptions, users } from "@workspace/db";
import { and, asc, eq, gt, gte, lt, lte } from "drizzle-orm";
import { logger } from "../logger";
import { sendRefundEmail } from "../billing";

export type BillingEventType =
  | "first_invoice_captured"
  | "mandate_required"
  | "mandate_confirmed"
  | "mandate_abandoned"
  | "plan_activated"
  | "plan_renewed"
  | "payment_refunded"
  | "subscription_cancelled"
  | "reconciliation_fix"
  | "webhook_processed"
  | "autopay_verification_charged"
  | "autopay_verification_refunded"
  | "autopay_verification_refund_forced"
  | "payment_refund_processed";

export type PaymentLifecycleStatus =
  | "pending"
  | "awaiting_mandate"
  | "success"
  | "failed"
  | "abandoned"
  | "refunded";

export const MANDATE_READY_STATUSES = new Set(["authenticated", "active", "pending", "halted"]);

/** Stale first-invoice holds without Autopay auth are auto-refunded after this window. */
export const AWAITING_MANDATE_TTL_MS = 24 * 60 * 60 * 1000;

export function isMandateReadyStatus(status: string | null | undefined): boolean {
  return !!status && MANDATE_READY_STATUSES.has(status);
}

export async function recordLedgerEvent(input: {
  userId: string;
  paymentId?: string | null;
  eventType: BillingEventType | string;
  amountPaise?: number;
  currency?: string;
  plan?: string | null;
  razorpayPaymentId?: string | null;
  razorpayOrderId?: string | null;
  razorpaySubscriptionId?: string | null;
  razorpayRefundId?: string | null;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
}): Promise<{ inserted: boolean; id?: string }> {
  try {
    const [row] = await db
      .insert(billingLedger)
      .values({
        userId: input.userId,
        paymentId: input.paymentId || null,
        eventType: input.eventType,
        amountPaise: input.amountPaise ?? 0,
        currency: input.currency || "INR",
        plan: input.plan || null,
        razorpayPaymentId: input.razorpayPaymentId || null,
        razorpayOrderId: input.razorpayOrderId || null,
        razorpaySubscriptionId: input.razorpaySubscriptionId || null,
        razorpayRefundId: input.razorpayRefundId || null,
        idempotencyKey: input.idempotencyKey,
        metadata: input.metadata || {},
      })
      .onConflictDoNothing()
      .returning({ id: billingLedger.id });
    return { inserted: !!row, id: row?.id };
  } catch (error) {
    logger.error({ error, key: input.idempotencyKey }, "billing ledger write failed");
    return { inserted: false };
  }
}

/**
 * Claim a Razorpay webhook event for processing.
 * Returns { claim: 'process' } on first sight, { claim: 'duplicate' } if already seen.
 */
export async function claimWebhookEvent(input: {
  eventId: string;
  eventType: string;
  payload: unknown;
}): Promise<{ claim: "process" | "duplicate"; rowId?: string }> {
  if (!input.eventId) {
    // Empty event id cannot be idempotent — reject rather than process blindly.
    logger.warn({ eventType: input.eventType }, "webhook missing event.id — refusing claim");
    return { claim: "duplicate" };
  }
  try {
    const [row] = await db
      .insert(razorpayWebhookEvents)
      .values({
        eventId: input.eventId,
        eventType: input.eventType,
        payload: (input.payload || {}) as Record<string, unknown>,
        processingStatus: "received",
      })
      .onConflictDoNothing()
      .returning({ id: razorpayWebhookEvents.id });

    if (row) return { claim: "process", rowId: row.id };

    // Previously failed events must be reclaimable so Razorpay retries are not
    // permanently dropped after the first handler error.
    const [existing] = await db
      .select({
        id: razorpayWebhookEvents.id,
        processingStatus: razorpayWebhookEvents.processingStatus,
      })
      .from(razorpayWebhookEvents)
      .where(eq(razorpayWebhookEvents.eventId, input.eventId))
      .limit(1);

    if (existing?.processingStatus === "failed") {
      const [reclaimed] = await db
        .update(razorpayWebhookEvents)
        .set({
          processingStatus: "received",
          error: null,
          payload: (input.payload || {}) as Record<string, unknown>,
          eventType: input.eventType,
          processedAt: null,
        })
        .where(
          and(
            eq(razorpayWebhookEvents.id, existing.id),
            eq(razorpayWebhookEvents.processingStatus, "failed"),
          ),
        )
        .returning({ id: razorpayWebhookEvents.id });
      if (reclaimed) {
        return { claim: "process", rowId: reclaimed.id };
      }
    }

    return { claim: "duplicate" };
  } catch (error) {
    logger.error({ error, eventId: input.eventId }, "webhook claim failed — refusing process to avoid doubles");
    return { claim: "duplicate" };
  }
}

export async function markWebhookProcessed(
  rowId: string | undefined,
  status: "processed" | "failed" | "ignored",
  error?: string,
) {
  if (!rowId) return;
  try {
    await db
      .update(razorpayWebhookEvents)
      .set({
        processingStatus: status,
        error: error || null,
        processedAt: new Date(),
      })
      .where(eq(razorpayWebhookEvents.id, rowId));
  } catch (err) {
    logger.warn({ err, rowId }, "markWebhookProcessed failed");
  }
}

export async function listStaleAwaitingMandatePayments(limit = 100) {
  const cutoff = new Date(Date.now() - AWAITING_MANDATE_TTL_MS);
  return db
    .select()
    .from(payments)
    .where(and(eq(payments.status, "awaiting_mandate"), lt(payments.createdAt, cutoff)))
    .orderBy(asc(payments.createdAt))
    .limit(limit);
}

export type RefundFn = (paymentId: string, amountPaise: number) => Promise<{ id: string } | null>;
export type CancelSubFn = (subscriptionId: string) => Promise<void>;
export type FetchPaymentFn = (
  paymentId: string,
) => Promise<{ amountPaise: number; amountRefundedPaise: number; status: string } | null>;

/** Verification debits above this are never auto-refunded by the sweep (sanity cap). */
const VERIFICATION_MAX_PAISE = 500; // ₹5
/** Give Razorpay's own auto-refund this long before we force one ourselves. */
const VERIFICATION_REFUND_GRACE_MS = 3 * 24 * 60 * 60 * 1000;
/** Don't sweep rows older than this (already settled / pre-feature rows). */
const VERIFICATION_SWEEP_WINDOW_MS = 60 * 24 * 60 * 60 * 1000;

/**
 * Safety net: the ₹1 Autopay verification debit is normally auto-refunded by
 * Razorpay. If a captured verification charge is still un-refunded after the
 * grace window, force the refund ourselves so no user is ever double-collected.
 */
export async function sweepUnrefundedAutopayVerifications(opts: {
  fetchPayment: FetchPaymentFn;
  refundPayment: RefundFn;
  limit?: number;
}): Promise<{ checked: number; refunded: number; errors: number }> {
  const now = Date.now();
  const rows = await db
    .select()
    .from(payments)
    .where(
      and(
        eq(payments.kind, "subscription_enable"),
        eq(payments.status, "success"),
        gt(payments.amount, 0),
        lte(payments.amount, VERIFICATION_MAX_PAISE),
        lt(payments.createdAt, new Date(now - VERIFICATION_REFUND_GRACE_MS)),
        gte(payments.createdAt, new Date(now - VERIFICATION_SWEEP_WINDOW_MS)),
      ),
    )
    .orderBy(asc(payments.createdAt))
    .limit(opts.limit ?? 50);

  let checked = 0;
  let refunded = 0;
  let errors = 0;

  for (const row of rows) {
    if (!row.razorpayPaymentId || row.razorpayPaymentId.startsWith("mock_")) continue;
    checked += 1;
    try {
      const remote = await opts.fetchPayment(row.razorpayPaymentId);
      if (!remote) continue;

      if (remote.amountRefundedPaise >= remote.amountPaise) {
        // Razorpay already refunded it — just make sure the ledger says so.
        await recordLedgerEvent({
          userId: row.userId,
          paymentId: row.id,
          eventType: "autopay_verification_refunded",
          amountPaise: remote.amountRefundedPaise,
          plan: row.plan,
          razorpayPaymentId: row.razorpayPaymentId,
          idempotencyKey: `autopay_verification_refunded:${row.id}`,
          metadata: { via: "sweep_confirmed", status: remote.status },
        });
        continue;
      }

      if (remote.status !== "captured") continue;

      const outstanding = remote.amountPaise - remote.amountRefundedPaise;
      const refund = await opts.refundPayment(row.razorpayPaymentId, outstanding);
      if (refund?.id) {
        refunded += 1;
        await recordLedgerEvent({
          userId: row.userId,
          paymentId: row.id,
          eventType: "autopay_verification_refund_forced",
          amountPaise: outstanding,
          plan: row.plan,
          razorpayPaymentId: row.razorpayPaymentId,
          razorpayRefundId: refund.id,
          idempotencyKey: `autopay_verification_refund_forced:${row.id}`,
          metadata: { reason: "verification_not_auto_refunded" },
        });
        logger.info(
          { paymentId: row.id, userId: row.userId, refundId: refund.id, outstanding },
          "Force-refunded un-refunded Autopay verification debit",
        );
      }
    } catch (error) {
      errors += 1;
      logger.error({ error, paymentId: row.id }, "sweepUnrefundedAutopayVerifications row failed");
    }
  }

  return { checked, refunded, errors };
}

/**
 * Expire stale awaiting_mandate rows: cancel pending Autopay sub, refund first invoice, mark abandoned/refunded.
 */
export async function expireStaleAwaitingMandates(opts: {
  refundPayment: RefundFn;
  cancelSubscription: CancelSubFn;
  limit?: number;
}): Promise<{ expired: number; refunded: number; errors: number }> {
  const rows = await listStaleAwaitingMandatePayments(opts.limit ?? 100);
  let expired = 0;
  let refunded = 0;
  let errors = 0;

  for (const row of rows) {
    try {
      // Enable-autopay rows: cancel the pending delayed sub only — keep premium intact.
      if (row.kind === "subscription_enable") {
        if (row.razorpaySubscriptionId) {
          try {
            await opts.cancelSubscription(row.razorpaySubscriptionId);
          } catch (err) {
            logger.warn({ err, subId: row.razorpaySubscriptionId }, "expireAwaiting: cancel enable sub failed");
          }
        }
        await db.update(payments).set({ status: "abandoned" }).where(eq(payments.id, row.id));
        await recordLedgerEvent({
          userId: row.userId,
          paymentId: row.id,
          eventType: "mandate_abandoned",
          amountPaise: 0,
          plan: row.plan,
          razorpaySubscriptionId: row.razorpaySubscriptionId,
          idempotencyKey: `expire_awaiting:${row.id}`,
          metadata: { reason: "awaiting_mandate_ttl", enableOnly: true },
        });
        expired += 1;
        continue;
      }

      if (row.razorpaySubscriptionId) {
        try {
          await opts.cancelSubscription(row.razorpaySubscriptionId);
        } catch (err) {
          logger.warn({ err, subId: row.razorpaySubscriptionId }, "expireAwaiting: cancel sub failed");
        }
        await db
          .update(subscriptions)
          .set({ razorpaySubscriptionId: null })
          .where(
            and(
              eq(subscriptions.userId, row.userId),
              eq(subscriptions.razorpaySubscriptionId, row.razorpaySubscriptionId),
            ),
          );
      }

      let refundId: string | null = null;
      if (row.razorpayPaymentId && row.amount > 0) {
        const refund = await opts.refundPayment(row.razorpayPaymentId, row.amount);
        refundId = refund?.id || null;
        if (refundId) refunded += 1;
      }

      await db
        .update(payments)
        .set({ status: refundId ? "refunded" : "abandoned" })
        .where(eq(payments.id, row.id));

      await recordLedgerEvent({
        userId: row.userId,
        paymentId: row.id,
        eventType: refundId ? "payment_refunded" : "mandate_abandoned",
        amountPaise: row.amount,
        plan: row.plan,
        razorpayPaymentId: row.razorpayPaymentId,
        razorpayOrderId: row.razorpayOrderId,
        razorpaySubscriptionId: row.razorpaySubscriptionId,
        razorpayRefundId: refundId,
        idempotencyKey: `expire_awaiting:${row.id}`,
        metadata: { reason: "awaiting_mandate_ttl" },
      });
      if (refundId) {
        try {
          const [user] = await db.select().from(users).where(eq(users.id, row.userId)).limit(1);
          if (user?.email) {
            await sendRefundEmail({
              email: user.email,
              userName: user.name || "there",
              plan: row.plan || "plan",
              amountInr: row.amount / 100,
              refundId,
              userId: row.userId,
              reason: "awaiting_mandate_ttl",
            });
          }
        } catch (mailErr) {
          logger.warn({ mailErr, paymentId: row.id }, "TTL refund email failed (non-fatal)");
        }
      }
      expired += 1;
    } catch (error) {
      errors += 1;
      logger.error({ error, paymentId: row.id }, "expireStaleAwaitingMandates row failed");
    }
  }

  return { expired, refunded, errors };
}
