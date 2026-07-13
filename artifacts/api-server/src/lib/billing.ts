import { sendEmail } from './mailer';
import { getBillingReceiptEmail, getActivationEmail } from './templates';
import { generateInvoicePDF } from './invoice';
import { logger } from './logger';

export const sendBillingEmail = async (email: string, userName: string, plan: string, amount: number, transactionId: string) => {
  let subject = "Your Bexo Payment Receipt";
  let html = "";
  
  if (plan === 'activation_code') {
    subject = "Bexo Account Activated";
    html = getActivationEmail(userName, transactionId);
  } else {
    html = getBillingReceiptEmail(userName, plan, amount, transactionId);
  }

  try {
    const pdfBuffer = await generateInvoicePDF(userName, plan, amount, transactionId);
    
    await sendEmail(email, subject, html, [
      {
        filename: `Bexo_Invoice_${transactionId}.pdf`,
        content: pdfBuffer,
        contentType: 'application/pdf',
      }
    ]);
  } catch (err) {
    logger.error({ err }, "Failed to generate or send invoice email");
    // Fallback to sending without PDF if generation fails
    await sendEmail(email, subject, html);
  }
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
          // Replace this with your actual approved MSG91 billing template name
          name: "bexo_billing_receipt",
          language: {
            code: "en",
            policy: "deterministic"
          },
          namespace: process.env.MSG91_TEMPLATE_NAMESPACE || "",
          to_and_components: [
            {
              to: [phone],
              components: {
                body_1: { type: "text", value: userName },
                body_2: { type: "text", value: plan },
                body_3: { type: "text", value: `₹${amount}` },
              }
            }
          ]
        }
      }
    };

    const response = await fetch("https://api.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/", {
      method: "POST",
      headers: {
        "authkey": authKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
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
