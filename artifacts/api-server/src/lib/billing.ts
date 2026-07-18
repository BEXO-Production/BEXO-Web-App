import { logger } from "./logger";
import { enqueueEmail } from "./emailOutbox";

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
