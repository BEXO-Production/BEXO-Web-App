import { and, eq, lte, or, sql } from "drizzle-orm";
import { db, emailDeliveries, leadReplies } from "@workspace/db";
import { logger } from "./logger";
import { isSmtpConfigured, sendEmail } from "./mailer";
import {
  getActivationEmail,
  getActivationCodeIssuedEmail,
  getBillingReceiptEmail,
  getCartRecoveryEmail,
  getContactNotificationEmail,
  getLeadReplyEmail,
  getSiteLiveEmail,
  getWelcomeEmail,
  getRecoveryEmail,
  getRenewalReminderEmail,
  getUpcomingDebitReminderEmail,
  getPaymentFailedEmail,
  getPlanPriceChangeEmail,
  getPremiumTrialStartedEmail,
  getSubscriptionCancelledEmail,
  getPaymentRefundedEmail,
  getSupportTicketCreatedEmail,
  getSupportTicketUpdatedEmail,
  getSupportTicketReplyEmail,
  getStaffInviteEmail,
  getStaffPasswordResetEmail,
} from "./templates";
import { generateInvoicePDF } from "./invoice";
import { uploadToR2 } from "./r2";
import { appOrigin } from "./platform";

type EnqueueInput = {
  eventType: string;
  recipient: string;
  subject: string;
  dedupeKey: string;
  payload?: Record<string, any>;
  userId?: string;
  relatedId?: string;
};

const MAX_ATTEMPTS = 6;

export async function enqueueEmail(input: EnqueueInput) {
  if (!input.recipient) {
    logger.warn({ eventType: input.eventType }, "Skipping email enqueue: missing recipient");
    return null;
  }

  try {
    const [row] = await db
      .insert(emailDeliveries)
      .values({
        eventType: input.eventType,
        recipient: input.recipient,
        subject: input.subject,
        dedupeKey: input.dedupeKey,
        payload: input.payload || {},
        userId: input.userId,
        relatedId: input.relatedId,
        status: "pending",
        nextRetryAt: new Date(),
      })
      .onConflictDoNothing({ target: emailDeliveries.dedupeKey })
      .returning();

    return row || null;
  } catch (error: any) {
    logger.error({ error: error?.message || error, dedupeKey: input.dedupeKey }, "Failed to enqueue email");
    return null;
  }
}

async function renderEmail(row: typeof emailDeliveries.$inferSelect) {
  const payload = (row.payload || {}) as Record<string, any>;
  const name = payload.userName || "there";
  const origin = appOrigin();

  switch (row.eventType) {
    case "welcome":
      return { html: getWelcomeEmail(name), attachments: undefined as any, replyTo: undefined as string | undefined };
    case "site_live":
      return {
        html: getSiteLiveEmail(name, payload.siteUrl || origin),
        attachments: undefined,
        replyTo: undefined,
      };
    case "recovery":
      return {
        html: getRecoveryEmail(name, payload.resumeUrl || origin),
        attachments: undefined,
        replyTo: undefined,
      };
    case "cart_recovery":
      return {
        html: getCartRecoveryEmail(name, payload.checkoutUrl || `${origin}/step/9`),
        attachments: undefined,
        replyTo: undefined,
      };
    case "renewal_reminder":
      return {
        html: getRenewalReminderEmail(
          name,
          payload.renewUrl || `${origin}/billing`,
          payload.expiresLabel || "",
        ),
        attachments: undefined,
        replyTo: undefined,
      };
    case "upcoming_debit_reminder":
      return {
        html: getUpcomingDebitReminderEmail(
          name,
          payload.amountLabel || "",
          payload.dateLabel || "",
          payload.planLabel || payload.plan || "your plan",
          payload.billingUrl || `${origin}/dashboard/settings/billing`,
          payload.baseLabel || "",
          payload.storageLabel || "",
          Number(payload.storageBlocks) || 0,
        ),
        attachments: undefined,
        replyTo: undefined,
      };
    case "payment_failed":
      return {
        html: getPaymentFailedEmail(
          name,
          payload.billingUrl || `${origin}/billing`,
          payload.pauseDate || "",
          Number(payload.dayBucket) || 0,
        ),
        attachments: undefined,
        replyTo: undefined,
      };
    case "plan_price_change":
      return {
        html: getPlanPriceChangeEmail(
          name,
          payload.planLabel || payload.plan || "your plan",
          Number(payload.oldPriceInr || 0),
          Number(payload.newPriceInr || 0),
          payload.billingUrl || `${origin}/billing`,
          payload.effectiveLabel || "",
        ),
        attachments: undefined,
        replyTo: undefined,
      };
    case "premium_trial_started":
      return {
        html: getPremiumTrialStartedEmail(
          name,
          payload.planLabel || payload.plan || "Premium",
          payload.expiresLabel || "",
          payload.billingUrl || `${origin}/billing`,
          payload.siteUrl || "",
        ),
        attachments: undefined,
        replyTo: "support@acedigital.cc",
      };
    case "subscription_cancelled":
      return {
        html: getSubscriptionCancelledEmail(
          name,
          payload.planLabel || payload.plan || "your plan",
          payload.expiresLabel || "",
          payload.billingUrl || `${origin}/billing`,
          payload.kind || "subscription",
        ),
        attachments: undefined,
        replyTo: undefined,
      };
    case "payment_refunded":
      return {
        html: getPaymentRefundedEmail(
          name,
          payload.planLabel || payload.plan || "your plan",
          Number(payload.amount || 0),
          payload.refundId || "",
          payload.billingUrl || `${origin}/billing`,
          !!payload.isPartial,
        ),
        attachments: undefined,
        replyTo: undefined,
      };
    case "activation":
      return {
        html: getActivationEmail(name, payload.code || payload.transactionId || ""),
        attachments: undefined,
        replyTo: undefined,
      };
    case "activation_code_issued":
      return {
        html: getActivationCodeIssuedEmail({
          userName: name,
          code: payload.code || "",
          planLabel: payload.planLabel || payload.plan || "Essential",
          features: Array.isArray(payload.features) ? payload.features.map(String) : [],
          organizationName: payload.organizationName || "",
          redeemUrl: payload.redeemUrl || `${origin}/billing`,
        }),
        attachments: undefined,
        replyTo: undefined,
      };
    case "billing_receipt": {
      const html = getBillingReceiptEmail(
        name,
        payload.plan || "annual",
        Number(payload.amount || 0),
        payload.transactionId || "",
      );
      let attachments: any[] | undefined;
      try {
        const pdfBuffer = await generateInvoicePDF(
          name,
          payload.plan || "annual",
          Number(payload.amount || 0),
          payload.transactionId || "receipt",
        );
        attachments = [
          {
            filename: `Bexo_Invoice_${payload.transactionId || "receipt"}.pdf`,
            content: pdfBuffer,
            contentType: "application/pdf",
          },
        ];
        try {
          const invoiceUrl = await uploadToR2(
            pdfBuffer,
            `Bexo_Invoice_${payload.transactionId || "receipt"}.pdf`,
            "application/pdf",
          );
          payload.invoiceUrl = invoiceUrl;
        } catch (err) {
          logger.warn({ err }, "Invoice R2 upload failed during outbox render");
        }
      } catch (err) {
        logger.warn({ err }, "Invoice PDF generation failed; sending receipt without attachment");
      }
      return { html, attachments, replyTo: undefined };
    }
    case "contact":
      return {
        html: getContactNotificationEmail(
          name,
          payload.senderName || "Someone",
          payload.senderEmail || "",
          payload.senderPhone || "",
          payload.message || "",
          payload.handle || "",
        ),
        attachments: undefined,
        replyTo: payload.senderEmail || undefined,
      };
    case "lead_reply":
      return {
        html: getLeadReplyEmail(
          payload.recipientName || "there",
          payload.ownerName || name || "A BEXO member",
          payload.handle || "",
          payload.body || "",
          payload.originalSnippet || "",
        ),
        attachments: undefined,
        // When the lead hits Reply, their mail goes to the portfolio owner's contact email.
        replyTo: payload.replyTo || undefined,
      };
    case "support_ticket_created":
      return {
        html: getSupportTicketCreatedEmail(
          name,
          payload.ticketNumber || "",
          payload.subject || "Support request",
          payload.description || "",
        ),
        attachments: undefined,
        replyTo: "support@acedigital.cc",
      };
    case "support_ticket_updated":
      return {
        html: getSupportTicketUpdatedEmail(
          name,
          payload.ticketNumber || "",
          payload.statusLabel || payload.status || "updated",
          payload.subject || "Support request",
          payload.note || "",
        ),
        attachments: undefined,
        replyTo: "support@acedigital.cc",
      };
    case "support_ticket_reply":
      return {
        html: getSupportTicketReplyEmail(
          name,
          payload.ticketNumber || "",
          payload.subject || "Support request",
          payload.body || "",
        ),
        attachments: undefined,
        replyTo: "support@acedigital.cc",
      };
    case "staff_invite":
      return {
        html: getStaffInviteEmail({
          userName: name,
          email: payload.email || row.recipient,
          role: payload.role || "support",
          temporaryPassword: payload.temporaryPassword || "",
          inviteUrl: payload.inviteUrl || "",
          loginUrl: payload.loginUrl || "",
          expiresLabel: payload.expiresLabel || "",
          isReinvite: !!payload.isReinvite,
        }),
        attachments: undefined,
        replyTo: undefined,
      };
    case "staff_password_reset":
      return {
        html: getStaffPasswordResetEmail({
          userName: name,
          email: payload.email || row.recipient,
          temporaryPassword: payload.temporaryPassword || "",
          resetUrl: payload.resetUrl || "",
          loginUrl: payload.loginUrl || "",
          expiresLabel: payload.expiresLabel || "",
        }),
        attachments: undefined,
        replyTo: undefined,
      };
    default:
      throw new Error(`No HTML template registered for email eventType=${row.eventType}`);
  }
}

export async function processEmailOutbox(limit = 20) {
  const now = new Date();
  const staleBefore = new Date(Date.now() - 5 * 60_000);

  // Reclaim rows stuck in `processing` after a crash/deploy mid-send.
  await db.execute(sql`
    UPDATE email_deliveries
    SET
      status = 'failed',
      last_error = COALESCE(last_error, 'Reclaimed stale processing claim'),
      next_retry_at = ${now},
      updated_at = NOW()
    WHERE status = 'processing'
      AND updated_at < ${staleBefore}
  `);

  // If SMTP came online after earlier skips, re-queue recent skipped rows.
  if (isSmtpConfigured()) {
    await db.execute(sql`
      UPDATE email_deliveries
      SET
        status = 'pending',
        next_retry_at = ${now},
        last_error = 'Re-queued after SMTP became available',
        updated_at = NOW()
      WHERE status = 'skipped'
        AND updated_at > NOW() - INTERVAL '7 days'
        AND attempts < ${MAX_ATTEMPTS}
    `);
  }

  // Claim rows atomically across Cloud Run replicas (SKIP LOCKED).
  const claimed = await db.execute(sql`
    UPDATE email_deliveries
    SET
      status = 'processing',
      updated_at = NOW(),
      attempts = attempts + 1
    WHERE id IN (
      SELECT id FROM email_deliveries
      WHERE (status = 'pending' OR status = 'failed')
        AND (next_retry_at IS NULL OR next_retry_at <= ${now})
        AND attempts < ${MAX_ATTEMPTS}
      ORDER BY created_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT ${limit}
    )
    RETURNING *
  `);

  const pending = (claimed as { rows?: any[] }).rows
    || (Array.isArray(claimed) ? claimed : []);

  for (const raw of pending) {
    const row = {
      id: raw.id,
      eventType: raw.event_type ?? raw.eventType,
      recipient: raw.recipient,
      subject: raw.subject,
      payload: raw.payload || {},
      attempts: Number(raw.attempts) || 0,
      relatedId: raw.related_id ?? raw.relatedId,
      userId: raw.user_id ?? raw.userId,
      dedupeKey: raw.dedupe_key ?? raw.dedupeKey ?? "",
      status: raw.status,
    } as typeof emailDeliveries.$inferSelect;

    try {
      const rendered = await renderEmail(row);
      const result = await sendEmail(row.recipient, row.subject, rendered.html, {
        attachments: rendered.attachments,
        replyTo: rendered.replyTo,
      });

      if (result.ok) {
        await db
          .update(emailDeliveries)
          .set({
            status: "sent",
            providerMessageId: result.messageId,
            sentAt: new Date(),
            updatedAt: new Date(),
            lastError: null,
            payload: row.payload,
          })
          .where(eq(emailDeliveries.id, row.id));

        if (row.eventType === "lead_reply" && row.relatedId) {
          await db
            .update(leadReplies)
            .set({
              status: "sent",
              emailDeliveryId: row.id,
              providerMessageId: result.messageId || null,
              sentAt: new Date(),
              lastError: null,
            })
            .where(eq(leadReplies.id, row.relatedId));
        }
      } else if (result.skipped) {
        // Keep retryable so fixing SMTP does not permanently lose the event.
        const delayMinutes = Math.min(30, 2 ** Math.min(row.attempts, 4));
        await db
          .update(emailDeliveries)
          .set({
            status: "failed",
            lastError: result.error || "SMTP not configured",
            nextRetryAt: new Date(Date.now() + delayMinutes * 60_000),
            updatedAt: new Date(),
          })
          .where(eq(emailDeliveries.id, row.id));

        if (row.eventType === "lead_reply" && row.relatedId) {
          await db
            .update(leadReplies)
            .set({
              status: "failed",
              emailDeliveryId: row.id,
              lastError: result.error || "SMTP not configured",
            })
            .where(eq(leadReplies.id, row.relatedId));
        }
      } else {
        const delayMinutes = Math.min(60, 2 ** Math.min(row.attempts, 5));
        await db
          .update(emailDeliveries)
          .set({
            status: "failed",
            lastError: result.error || "Send failed",
            nextRetryAt: new Date(Date.now() + delayMinutes * 60_000),
            updatedAt: new Date(),
          })
          .where(eq(emailDeliveries.id, row.id));

        if (row.eventType === "lead_reply" && row.relatedId) {
          await db
            .update(leadReplies)
            .set({
              status: "failed",
              emailDeliveryId: row.id,
              lastError: result.error || "Send failed",
            })
            .where(eq(leadReplies.id, row.relatedId));
        }
      }
    } catch (error: any) {
      const delayMinutes = Math.min(60, 2 ** Math.min(row.attempts, 5));
      await db
        .update(emailDeliveries)
        .set({
          status: "failed",
          lastError: error?.message || "Outbox processing error",
          nextRetryAt: new Date(Date.now() + delayMinutes * 60_000),
          updatedAt: new Date(),
        })
        .where(eq(emailDeliveries.id, row.id));

      if (row.eventType === "lead_reply" && row.relatedId) {
        await db
          .update(leadReplies)
          .set({
            status: "failed",
            emailDeliveryId: row.id,
            lastError: error?.message || "Outbox processing error",
          })
          .where(eq(leadReplies.id, row.relatedId));
      }
    }
  }
}

let outboxTimer: NodeJS.Timeout | null = null;

export function startEmailOutboxWorker() {
  if (outboxTimer) return;
  const tick = async () => {
    try {
      await processEmailOutbox();
    } catch (error) {
      logger.error({ error }, "Email outbox worker tick failed");
    }
  };
  void tick();
  outboxTimer = setInterval(tick, 30_000);
  logger.info("Email outbox worker started");
}
