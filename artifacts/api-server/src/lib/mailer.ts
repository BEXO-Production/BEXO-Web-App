import nodemailer from 'nodemailer';
import { logger } from './logger';

export const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_PORT === '465',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export const sendEmail = async (to: string, subject: string, html: string, attachments?: nodemailer.SendMailOptions['attachments']) => {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    logger.warn("SMTP credentials not configured. Skipping email to: " + to);
    return false;
  }

  try {
    const info = await transporter.sendMail({
      from: `"Bexo Support" <${process.env.SMTP_USER}>`,
      to,
      subject,
      html,
      attachments,
    });
    logger.info({ to, messageId: info.messageId }, "Email sent successfully");
    return true;
  } catch (error) {
    logger.error({ error, to }, "Failed to send email");
    return false;
  }
};
