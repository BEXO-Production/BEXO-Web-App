import nodemailer from "nodemailer";
import { logger } from "./logger";

export type SendEmailResult = {
  ok: boolean;
  skipped?: boolean;
  messageId?: string;
  error?: string;
};

let transporter: nodemailer.Transporter | null = null;
let verified = false;

const getSmtpConfig = () => {
  const host = process.env.SMTP_HOST || "smtp.mailer91.com";
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const fromName = process.env.SMTP_FROM_NAME || "Bexo Support";
  const fromEmail = process.env.SMTP_FROM || user;
  return { host, port, user, pass, fromName, fromEmail };
};

export const isSmtpConfigured = () => {
  const { user, pass } = getSmtpConfig();
  return Boolean(user && pass);
};

const getTransporter = () => {
  if (!transporter) {
    const { host, port, user, pass } = getSmtpConfig();
    transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: user && pass ? { user, pass } : undefined,
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 20000,
    });
  }
  return transporter;
};

export async function verifyMailer(): Promise<boolean> {
  if (!isSmtpConfigured()) {
    logger.warn("SMTP credentials not configured (MSG91 SMTP). Email delivery disabled.");
    return false;
  }
  try {
    await getTransporter().verify();
    verified = true;
    logger.info("MSG91 SMTP transporter verified.");
    return true;
  } catch (error: any) {
    verified = false;
    logger.error({ error: error?.message || error }, "MSG91 SMTP verification failed");
    return false;
  }
}

export const sendEmail = async (
  to: string,
  subject: string,
  html: string,
  options?: {
    attachments?: nodemailer.SendMailOptions["attachments"];
    replyTo?: string;
  },
): Promise<SendEmailResult> => {
  if (!isSmtpConfigured()) {
    const message = `SMTP credentials not configured. Skipping email to: ${to}`;
    logger.warn(message);
    return { ok: false, skipped: true, error: message };
  }

  try {
    if (!verified) {
      await verifyMailer();
    }

    const { fromName, fromEmail } = getSmtpConfig();
    const mailTransporter = getTransporter();
    const info = await mailTransporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to,
      subject,
      html,
      replyTo: options?.replyTo,
      attachments: options?.attachments,
    });

    logger.info({ to, messageId: info.messageId, subject }, "Email sent successfully");
    return { ok: true, messageId: info.messageId };
  } catch (error: any) {
    const message = error?.message || "Failed to send email";
    logger.error({ error: message, to, subject }, "Failed to send email");
    return { ok: false, error: message };
  }
};
