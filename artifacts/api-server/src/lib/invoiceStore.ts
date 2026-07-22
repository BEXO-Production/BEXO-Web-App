import { db, payments, users } from "@workspace/db";
import { eq } from "drizzle-orm";
import { generateInvoicePDF } from "./invoice";
import { uploadToR2 } from "./r2";
import { logger } from "./logger";
import { formatBillingAddressLines, getBillingProfile } from "./billingProfile";

/**
 * Generate the PDF tax invoice for a successful payment, upload it to R2 and
 * persist the URL on the payments row. Idempotent (skips rows that already
 * have an invoice) and best-effort (never throws into payment flows).
 */
export async function generateAndStoreInvoice(paymentId: string): Promise<string | null> {
  try {
    const [payment] = await db.select().from(payments).where(eq(payments.id, paymentId)).limit(1);
    if (!payment || payment.status !== "success") return null;
    if (payment.invoiceUrl) return payment.invoiceUrl;
    if (!payment.amount || payment.amount <= 0) return null;

    const [user] = await db.select().from(users).where(eq(users.id, payment.userId)).limit(1);
    const profile = await getBillingProfile(payment.userId);
    const reference = payment.razorpayPaymentId || payment.razorpayOrderId || payment.id;

    const pdfBuffer = await generateInvoicePDF(
      profile?.fullName || user?.name || "Bexo User",
      payment.plan || "annual",
      payment.amount / 100,
      reference,
      profile
        ? {
            fullName: profile.fullName,
            email: profile.email,
            phone: profile.phone,
            addressLines: formatBillingAddressLines(profile),
          }
        : {
            fullName: user?.name || undefined,
            email: user?.email || undefined,
            phone: user?.phone || undefined,
          },
    );

    const invoiceUrl = await uploadToR2(pdfBuffer, `Bexo_Invoice_${reference}.pdf`, "application/pdf");
    await db.update(payments).set({ invoiceUrl }).where(eq(payments.id, payment.id));
    logger.info({ paymentId, invoiceUrl }, "Invoice generated and stored");
    return invoiceUrl;
  } catch (err) {
    logger.warn({ err, paymentId }, "Failed to generate/store invoice");
    return null;
  }
}

/** Backfill invoices for any successful paid rows missing one (idempotent). */
export async function backfillMissingInvoices(userId: string): Promise<void> {
  try {
    const rows = await db.select().from(payments).where(eq(payments.userId, userId));
    for (const row of rows) {
      if (row.status === "success" && !row.invoiceUrl && row.amount > 0) {
        await generateAndStoreInvoice(row.id);
      }
    }
  } catch (err) {
    logger.warn({ err, userId }, "Invoice backfill failed");
  }
}
