import nodemailer from 'nodemailer';
import { logger } from './logger';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_PORT === '465',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export const sendBillingEmail = async (email: string, userName: string, plan: string, amount: number, transactionId: string) => {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    logger.warn("SMTP credentials not configured. Skipping billing email.");
    return;
  }

  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 10px;">
      <h2 style="color: #0f172a;">Bexo - Payment Receipt</h2>
      <p>Hi ${userName},</p>
      <p>Thank you for subscribing to Bexo! Your payment was successful.</p>
      <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
        <tr>
          <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;"><strong>Plan:</strong></td>
          <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: right;">${plan === 'annual' ? 'Annual Plan' : plan === 'lifetime' ? 'Lifetime Access' : 'Activation Code'}</td>
        </tr>
        <tr>
          <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;"><strong>Transaction ID:</strong></td>
          <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: right;">${transactionId}</td>
        </tr>
        <tr>
          <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;"><strong>Amount Paid:</strong></td>
          <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: right; font-weight: bold;">₹${amount}</td>
        </tr>
      </table>
      <p style="margin-top: 20px;">You can now access all premium features in your dashboard.</p>
      <p style="color: #64748b; font-size: 12px; margin-top: 30px;">If you have any questions, please contact support.</p>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: `"Bexo Support" <${process.env.SMTP_USER}>`,
      to: email,
      subject: "Your Bexo Payment Receipt",
      html,
    });
    logger.info({ email }, "Billing email sent successfully");
  } catch (error) {
    logger.error({ error }, "Failed to send billing email");
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
