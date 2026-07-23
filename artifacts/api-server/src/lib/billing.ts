import { logger } from "./logger";
import { enqueueEmail } from "./emailOutbox";
import { appOrigin } from "./platform";

/** User cancelled Autopay / subscription at period end. */
export async function sendCancellationEmail(opts: {
  email: string;
  userName: string;
  plan: string;
  expiresAt?: string | Date | null;
  userId?: string;
  kind?: "subscription" | "addon";
}) {
  if (!opts.email) return false;
  const expiresLabel = opts.expiresAt
    ? new Date(opts.expiresAt).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "";
  const kind = opts.kind || "subscription";
  const dedupeKey = `subscription_cancelled:${opts.userId || opts.email}:${kind}:${expiresLabel || "na"}`;
  const queued = await enqueueEmail({
    eventType: "subscription_cancelled",
    recipient: opts.email,
    subject:
      kind === "addon"
        ? "Storage add-on auto-renew cancelled"
        : "Your BEXO auto-renew has been cancelled",
    dedupeKey,
    userId: opts.userId,
    payload: {
      userName: opts.userName || "there",
      plan: opts.plan,
      planLabel: opts.plan,
      expiresLabel,
      kind,
      billingUrl: `${appOrigin()}/billing`,
    },
  });
  return Boolean(queued);
}

/** Refund confirmation after admin refund, TTL abandon, or mandate abandon. */
export async function sendRefundEmail(opts: {
  email: string;
  userName: string;
  plan: string;
  amountInr: number;
  refundId: string;
  userId?: string;
  reason?: string;
  isPartial?: boolean;
}) {
  if (!opts.email || !opts.refundId) return false;
  const queued = await enqueueEmail({
    eventType: "payment_refunded",
    recipient: opts.email,
    subject: opts.isPartial
      ? "Partial refund processed — BEXO"
      : "Refund processed — BEXO",
    dedupeKey: `payment_refunded:${opts.refundId}:${opts.email}`,
    userId: opts.userId,
    relatedId: opts.refundId,
    payload: {
      userName: opts.userName || "there",
      plan: opts.plan,
      planLabel: opts.plan,
      amount: opts.amountInr,
      refundId: opts.refundId,
      reason: opts.reason || "",
      isPartial: !!opts.isPartial,
      billingUrl: `${appOrigin()}/billing`,
    },
  });
  return Boolean(queued);
}

export const sendBillingEmail = async (
  email: string,
  userName: string,
  plan: string,
  amount: number,
  transactionId: string,
  userId?: string,
) => {
  const eventType = plan === "activation_code" ? "activation" : "billing_receipt";
  const subject = plan === "activation_code" ? "Bexo Account Activated" : "Your Bexo Payment Receipt";
  const dedupeKey = `${eventType}:${transactionId}:${email}`;

  const queued = await enqueueEmail({
    eventType,
    recipient: email,
    subject,
    dedupeKey,
    userId,
    relatedId: transactionId,
    payload: {
      userName,
      plan,
      amount,
      transactionId,
      code: transactionId,
    },
  });

  if (!queued) {
    logger.warn({ email, transactionId, eventType }, "Billing email was not enqueued (possible duplicate)");
  }

  return Boolean(queued);
};

export const sendBillingWhatsApp = async (phone: string, userName: string, plan: string, amount: number) => {
  const authKey = process.env.MSG91_AUTH_KEY;
  const integratedNumber = process.env.MSG91_INTEGRATED_NUMBER;

  if (!authKey || authKey === "your_msg91_auth_key") {
    logger.warn("MSG91 credentials not configured. Skipping WhatsApp billing notification.");
    return;
  }

  try {
    const payload = {
      integrated_number: integratedNumber,
      content_type: "template",
      payload: {
        messaging_product: "whatsapp",
        type: "template",
        template: {
          name: "bexo_billing_receipt",
          language: {
            code: "en",
            policy: "deterministic",
          },
          namespace: process.env.MSG91_TEMPLATE_NAMESPACE || "",
          to_and_components: [
            {
              to: [phone],
              components: {
                body_1: { type: "text", value: userName },
                body_2: { type: "text", value: plan },
                body_3: { type: "text", value: `₹${amount}` },
              },
            },
          ],
        },
      },
    };

    const response = await fetch("https://api.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/", {
      method: "POST",
      headers: {
        authkey: authKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`MSG91 API error: ${errText}`);
    }

    logger.info({ phone }, "WhatsApp billing notification sent successfully");
  } catch (error) {
    logger.error({ error }, "Failed to send WhatsApp billing notification");
  }
};
