import { and, eq, lte, or, sql } from "drizzle-orm";
import { db, emailDeliveries, leadReplies } from "@workspace/db";
import { logger } from "./logger";
import { sendEmail } from "./mailer";
import {
  getActivationEmail,
  getBillingReceiptEmail,
  getCartRecoveryEmail,
  getContactNotificationEmail,
  getLeadReplyEmail,
  getSiteLiveEmail,
  getWelcomeEmail,
  getRecoveryEmail,
  getRenewalReminderEmail,
  getPaymentFailedEmail,
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
    case "activation":
      return {
        html: getActivationEmail(name, payload.code || payload.transactionId || ""),
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
    default:
      return {
        html: `<p>${row.subject}</p><pre>${JSON.stringify(payload, null, 2)}</pre>`,
        attachments: undefined,
        replyTo: undefined,
      };
  }
}

export async function processEmailOutbox(limit = 20) {
  const now = new Date();
  const pending = await db
    .select()
    .from(emailDeliveries)
    .where(
      and(
        or(eq(emailDeliveries.status, "pending"), eq(emailDeliveries.status, "failed")),
        or(sql`${emailDeliveries.nextRetryAt} IS NULL`, lte(emailDeliveries.nextRetryAt, now)),
        sql`${emailDeliveries.attempts} < ${MAX_ATTEMPTS}`,
      ),
    )
    .limit(limit);

  for (const row of pending) {
    await db
      .update(emailDeliveries)
      .set({ status: "processing", updatedAt: new Date(), attempts: row.attempts + 1 })
      .where(eq(emailDeliveries.id, row.id));

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
        await db
          .update(emailDeliveries)
          .set({
            status: "skipped",
            lastError: result.error || "SMTP not configured",
            updatedAt: new Date(),
          })
          .where(eq(emailDeliveries.id, row.id));

        if (row.eventType === "lead_reply" && row.relatedId) {
          await db
            .update(leadReplies)
            .set({
              status: "skipped",
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
