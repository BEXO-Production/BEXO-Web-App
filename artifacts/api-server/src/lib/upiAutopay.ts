import crypto from "crypto";
import { and, eq, isNull, lte, or, sql } from "drizzle-orm";
import Razorpay from "razorpay";
import {
  db,
  users,
  payments,
  billingProfiles,
  autopayMandates,
  scheduledCharges,
  billingLedger,
} from "@workspace/db";
import { logger } from "./logger";
import { calculatePlanAmount } from "./pricingCatalog";
import {
  STORAGE_BLOCK_BYTES,
  planBillingPeriod,
  planTermEnd,
  resolveSubscriptionState,
  activatePaidPlan,
  getRenewalExpiry,
  type PaidPlan,
} from "./subscriptions";
import { enqueueEmail } from "./emailOutbox";
import { sendBillingEmail, sendBillingWhatsApp } from "./billing";
import { appOrigin } from "./platform";

/** Email + WhatsApp receipt for a successful charge (mirrors payments.ts). */
async function sendBillingReceipts(userId: string, plan: string, amountPaid: number, reference: string) {
  const contact = await loadContact(userId);
  if (contact.email) {
    try {
      await sendBillingEmail(contact.email, contact.name, plan, amountPaid, reference, userId);
    } catch (err) {
      logger.error({ err, userId }, "upiAutopay: billing email enqueue failed");
    }
  }
  if (contact.phone) {
    sendBillingWhatsApp(contact.phone, contact.name, plan, amountPaid).catch((err) =>
      logger.error({ err, userId }, "upiAutopay: billing WhatsApp failed"),
    );
  }
}

// ————————————————————————————————————————————————————————————————
// Config / feature flag
// ————————————————————————————————————————————————————————————————

/** Master switch. When OFF the legacy Razorpay Subscriptions flow is used and
 *  none of this engine runs. Flip to "1" only after S2S recurring is enabled. */
export function isUpiAutopayEnabled(): boolean {
  const v = String(process.env.UPI_AUTOPAY_ENABLED || "").toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** UPI single-debit ceiling. Default ₹2000; NPCI hard cap for UPI is ₹15,000. */
export function mandateMaxAmountPaise(): number {
  const raw = Number(process.env.UPI_AUTOPAY_MAX_AMOUNT_PAISE || 200000);
  const safe = Number.isFinite(raw) && raw >= 100 ? Math.floor(raw) : 200000;
  return Math.min(safe, 1_500_000);
}

const MAX_ADDON_BLOCKS = 20;
const REMINDER_LEAD_MS = 24 * 60 * 60 * 1000; // RBI: notify ≥24h before debit
const CHARGE_MAX_ATTEMPTS = 4;
const TOKEN_EXPIRY_YEARS = 10;

const razorpayKeyId = process.env.RAZORPAY_KEY_ID || "";
const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET || "";
const razorpayReady = !!razorpayKeyId && !!razorpayKeySecret && !razorpayKeyId.includes("your_");
const razorpay = razorpayReady
  ? new Razorpay({ key_id: razorpayKeyId, key_secret: razorpayKeySecret })
  : null;

const UPI_PLANS: PaidPlan[] = ["identity", "essential", "growth"];
export function isUpiAutopayPlan(plan: string): plan is PaidPlan {
  return (UPI_PLANS as string[]).includes(plan);
}

function verifySignature(order_id: string, payment_id: string, signature: string): boolean {
  if (!razorpayKeySecret) return false;
  const expected = crypto
    .createHmac("sha256", razorpayKeySecret)
    .update(`${order_id}|${payment_id}`)
    .digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature || ""));
  } catch {
    return false;
  }
}

async function recordLedger(entry: {
  userId: string;
  eventType: string;
  amountPaise?: number;
  plan?: string | null;
  razorpayPaymentId?: string | null;
  razorpayOrderId?: string | null;
  idempotencyKey: string;
  metadata?: Record<string, any>;
}) {
  try {
    await db
      .insert(billingLedger)
      .values({
        userId: entry.userId,
        eventType: entry.eventType,
        amountPaise: entry.amountPaise ?? 0,
        plan: entry.plan ?? null,
        razorpayPaymentId: entry.razorpayPaymentId ?? null,
        razorpayOrderId: entry.razorpayOrderId ?? null,
        idempotencyKey: entry.idempotencyKey,
        metadata: entry.metadata ?? {},
      })
      .onConflictDoNothing({ target: billingLedger.idempotencyKey });
  } catch (err) {
    logger.warn({ err, idempotencyKey: entry.idempotencyKey }, "upiAutopay: ledger write failed");
  }
}

// ————————————————————————————————————————————————————————————————
// Customer + amount helpers
// ————————————————————————————————————————————————————————————————

async function loadContact(userId: string): Promise<{ name: string; email: string; phone: string }> {
  const [u] = await db
    .select({ name: users.name, email: users.email, phone: users.phone })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const [bp] = await db
    .select({ fullName: billingProfiles.fullName, email: billingProfiles.email, phone: billingProfiles.phone })
    .from(billingProfiles)
    .where(eq(billingProfiles.userId, userId))
    .limit(1);
  return {
    name: bp?.fullName || u?.name || "BEXO Member",
    email: bp?.email || u?.email || "",
    phone: bp?.phone || u?.phone || "",
  };
}

/** Create (or reuse) a Razorpay customer for this user and cache the id. */
async function ensureRazorpayCustomer(userId: string, existingId?: string | null): Promise<string> {
  if (existingId) return existingId;
  if (!razorpay) throw new Error("Razorpay not configured");
  const contact = await loadContact(userId);
  const customer: any = await razorpay.customers.create({
    name: contact.name,
    email: contact.email || undefined,
    contact: contact.phone || undefined,
    fail_existing: 0,
    notes: { userId },
  } as any);
  return customer.id as string;
}

/** Bytes the user is storing beyond their base plan quota → billable storage blocks. */
async function computeStorageOverage(
  userId: string,
  plan: PaidPlan,
): Promise<{ blocks: number; paise: number }> {
  try {
    const [u] = await db
      .select({ used: users.storageUsedBytes })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    const usedBytes = Number(u?.used || 0);

    // Base plan quota only (ignore add-on blocks — in token mode storage is
    // folded into this mandate, so overage is measured against the plan floor).
    const { planBaseQuota } = await import("./subscriptions");
    const baseQuota = planBaseQuota(plan);
    const overBytes = Math.max(0, usedBytes - baseQuota);
    if (overBytes <= 0) return { blocks: 0, paise: 0 };

    const blocks = Math.min(MAX_ADDON_BLOCKS, Math.ceil(overBytes / STORAGE_BLOCK_BYTES));
    if (blocks <= 0) return { blocks: 0, paise: 0 };
    const pricing = await calculatePlanAmount("storage_addon", undefined, blocks);
    return { blocks, paise: pricing.totalPaise };
  } catch (err) {
    logger.warn({ err, userId }, "upiAutopay: storage overage calc failed");
    return { blocks: 0, paise: 0 };
  }
}

/** Compose the next cycle's total: base plan list price + storage overage, capped by mandate ceiling. */
async function composeCycleAmount(
  userId: string,
  plan: PaidPlan,
  maxPaise: number,
): Promise<{ basePaise: number; storagePaise: number; storageBlocks: number; totalPaise: number; capped: boolean }> {
  const base = await calculatePlanAmount(plan, undefined, 1);
  const basePaise = base.totalPaise;
  const overage = await computeStorageOverage(userId, plan);
  let storagePaise = overage.paise;
  let capped = false;
  if (basePaise + storagePaise > maxPaise) {
    storagePaise = Math.max(0, maxPaise - basePaise);
    capped = true;
  }
  return {
    basePaise,
    storagePaise,
    storageBlocks: overage.blocks,
    totalPaise: basePaise + storagePaise,
    capped,
  };
}

// ————————————————————————————————————————————————————————————————
// Onboarding: authorization checkout
// ————————————————————————————————————————————————————————————————

/**
 * Build the UPI Autopay authorization checkout. The customer authorizes a
 * mandate (max_amount = ₹2000) AND pays the first invoice in the SAME Checkout —
 * no separate ₹1 mandate step. Returns Checkout options for the frontend.
 */
export async function createAuthorizationCheckout(opts: {
  userId: string;
  plan: PaidPlan;
  couponCode?: string | null;
}): Promise<{
  mode: "upi_autopay";
  orderId: string;
  customerId: string;
  key: string;
  amount: number;
  maxAmountPaise: number;
  recurring: 1;
  quotedNetPaise: number;
  fullPlanPaise: number;
  couponRefund: boolean;
  hasCouponDiscount: boolean;
}> {
  if (!razorpay) throw new Error("Razorpay not configured");
  const { userId, plan } = opts;
  const couponCode = opts.couponCode?.trim().toUpperCase() || null;

  const listPricing = await calculatePlanAmount(plan, undefined, 1);
  const netPricing = couponCode ? await calculatePlanAmount(plan, couponCode, 1) : listPricing;
  const fullPlanPaise = listPricing.totalPaise;
  const quotedNetPaise = netPricing.totalPaise;
  // Charge the amount due TODAY (coupon net). Mandate ceiling stays ₹2000 so
  // renewals / storage overage can debit up to that later — never charge the
  // full list price first and refund (that failed testers with low balance).
  const chargeNowPaise = Math.max(100, quotedNetPaise); // Razorpay UPI min ₹1
  const hasCouponDiscount = quotedNetPaise < fullPlanPaise && !!couponCode;
  const maxPaise = mandateMaxAmountPaise();

  const [existing] = await db
    .select()
    .from(autopayMandates)
    .where(eq(autopayMandates.userId, userId))
    .limit(1);

  const customerId = await ensureRazorpayCustomer(userId, existing?.razorpayCustomerId);

  const expireAt = Math.floor(Date.now() / 1000) + TOKEN_EXPIRY_YEARS * 365 * 24 * 60 * 60;

  // Authorization order: debit today's net amount + register a variable
  // (`as_presented`) mandate up to ₹2000 for future renewals / storage.
  const order: any = await razorpay.orders.create({
    amount: chargeNowPaise,
    currency: "INR",
    customer_id: customerId,
    method: "upi",
    receipt: `upi_auth_${userId.slice(0, 8)}_${Date.now()}`.slice(0, 40),
    token: {
      max_amount: maxPaise,
      expire_at: expireAt,
      frequency: "as_presented",
    },
    notes: {
      userId,
      plan,
      coupon: couponCode || "",
      quotedNetPaise: String(quotedNetPaise),
      fullPlanPaise: String(fullPlanPaise),
      chargeNowPaise: String(chargeNowPaise),
      kind: "upi_autopay_auth",
    },
  } as any);

  if (existing) {
    await db
      .update(autopayMandates)
      .set({
        plan,
        method: "upi",
        razorpayCustomerId: customerId,
        authOrderId: order.id,
        maxAmountPaise: maxPaise,
        status: "pending_authorization",
        couponCode,
        updatedAt: new Date(),
      })
      .where(eq(autopayMandates.id, existing.id));
  } else {
    await db.insert(autopayMandates).values({
      userId,
      plan,
      method: "upi",
      razorpayCustomerId: customerId,
      authOrderId: order.id,
      maxAmountPaise: maxPaise,
      status: "pending_authorization",
      couponCode,
    });
  }

  await db.insert(payments).values({
    userId,
    razorpayOrderId: order.id,
    amount: chargeNowPaise,
    status: "pending",
    plan,
    kind: "subscription",
    couponCode,
  });

  logger.info(
    {
      userId,
      plan,
      orderId: order.id,
      maxPaise,
      fullPlanPaise,
      quotedNetPaise,
      chargeNowPaise,
      hasCouponDiscount,
    },
    "upiAutopay: authorization checkout created (charge net today, mandate ≤ ₹2000)",
  );

  return {
    mode: "upi_autopay",
    orderId: order.id,
    customerId,
    key: razorpayKeyId,
    amount: chargeNowPaise,
    maxAmountPaise: maxPaise,
    recurring: 1,
    quotedNetPaise: chargeNowPaise,
    fullPlanPaise,
    // No post-charge refund — Checkout already debits the discounted amount.
    couponRefund: false,
    hasCouponDiscount,
  };
}

/**
 * Verify the authorization payment, store the recurring token, activate the
 * plan, refund any coupon discount, and schedule the next auto-debit.
 */
export async function verifyAuthorization(opts: {
  userId: string;
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}): Promise<{ ok: true; plan: PaidPlan; expiresAt: Date | null } | { ok: false; error: string; code?: string }> {
  if (!razorpay) return { ok: false, error: "Razorpay not configured" };
  const { userId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = opts;

  if (!verifySignature(razorpay_order_id, razorpay_payment_id, razorpay_signature)) {
    return { ok: false, error: "Payment verification failed", code: "SIGNATURE_INVALID" };
  }

  const [mandate] = await db
    .select()
    .from(autopayMandates)
    .where(and(eq(autopayMandates.userId, userId), eq(autopayMandates.authOrderId, razorpay_order_id)))
    .limit(1);
  if (!mandate) return { ok: false, error: "Mandate not found", code: "MANDATE_NOT_FOUND" };

  const payment: any = await razorpay.payments.fetch(razorpay_payment_id);
  const tokenId = payment?.token_id as string | undefined;
  if (!tokenId) {
    return { ok: false, error: "Autopay token not created — please retry.", code: "TOKEN_MISSING" };
  }
  const chargedPaise = Number(payment?.amount) || 0;

  const plan = mandate.plan as PaidPlan;
  const expiresAt = await getRenewalExpiry(userId, plan);

  await activatePaidPlan(userId, plan, expiresAt, { subscriptionId: null, planId: null });

  const period = planBillingPeriod(plan);
  const nextChargeAt = period === "lifetime" ? null : expiresAt;

  await db
    .update(autopayMandates)
    .set({
      razorpayTokenId: tokenId,
      authPaymentId: razorpay_payment_id,
      status: "active",
      currentPeriodStart: new Date(),
      currentPeriodEnd: expiresAt,
      nextChargeAt,
      tokenExpiresAt: null,
      lastChargeAt: new Date(),
      lastChargeStatus: "success",
      failureCount: 0,
      updatedAt: new Date(),
    })
    .where(eq(autopayMandates.id, mandate.id));

  await db
    .update(payments)
    .set({ razorpayPaymentId: razorpay_payment_id, status: "success" })
    .where(and(eq(payments.razorpayOrderId, razorpay_order_id), eq(payments.userId, userId)));

  await recordLedger({
    userId,
    eventType: "upi_autopay_authorized",
    amountPaise: chargedPaise,
    plan,
    razorpayPaymentId: razorpay_payment_id,
    razorpayOrderId: razorpay_order_id,
    idempotencyKey: `upi_auth:${razorpay_payment_id}`,
    metadata: { tokenId, maxAmountPaise: mandate.maxAmountPaise },
  });

  // Auth order already charged today's net (coupon) amount — no refund dance.
  if (mandate.couponCode) {
    try {
      const { recordCouponRedemption } = await import("./pricingCatalog");
      const [payRow] = await db
        .select({ id: payments.id })
        .from(payments)
        .where(and(eq(payments.razorpayOrderId, razorpay_order_id), eq(payments.userId, userId)))
        .limit(1);
      await recordCouponRedemption(mandate.couponCode, { userId, paymentId: payRow?.id || null });
    } catch (err) {
      logger.warn({ err, userId }, "upiAutopay: coupon redemption record failed");
    }
  }

  // Publish the portfolio: subdomainRouter treats missing onboardingCompletedAt
  // as "unclaimed" even when the handle + paid plan are already live.
  try {
    const { markOnboardingComplete } = await import("./lifecycleEmails");
    await markOnboardingComplete(userId);
  } catch (err) {
    logger.warn({ err, userId }, "upiAutopay: markOnboardingComplete failed");
  }

  try {
    await sendBillingReceipts(userId, plan, chargedPaise / 100, razorpay_payment_id);
  } catch (err) {
    logger.warn({ err, userId }, "upiAutopay: receipt enqueue failed");
  }

  // Pre-create the next scheduled charge so we can send the 24h reminder.
  if (nextChargeAt) await ensureScheduledCharge(mandate.id, userId, plan, nextChargeAt);

  logger.info({ userId, plan, tokenId, expiresAt, chargedPaise }, "upiAutopay: mandate active");
  return { ok: true, plan, expiresAt };
}

// ————————————————————————————————————————————————————————————————
// Merchant-run billing loop
// ————————————————————————————————————————————————————————————————

async function ensureScheduledCharge(
  mandateId: string,
  userId: string,
  plan: PaidPlan,
  scheduledFor: Date,
): Promise<void> {
  const idempotencyKey = `sched:${mandateId}:${scheduledFor.toISOString().slice(0, 10)}`;
  const amount = await composeCycleAmount(userId, plan, mandateMaxAmountPaise());
  const [mandate] = await db
    .select({ tokenId: autopayMandates.razorpayTokenId })
    .from(autopayMandates)
    .where(eq(autopayMandates.id, mandateId))
    .limit(1);
  await db
    .insert(scheduledCharges)
    .values({
      userId,
      mandateId,
      razorpayTokenId: mandate?.tokenId || null,
      plan,
      kind: amount.storagePaise > 0 ? "combined" : "renewal",
      basePaise: amount.basePaise,
      storagePaise: amount.storagePaise,
      storageBlocks: amount.storageBlocks,
      totalPaise: amount.totalPaise,
      scheduledFor,
      status: "scheduled",
      idempotencyKey,
    })
    .onConflictDoNothing({ target: scheduledCharges.idempotencyKey });
}

function formatInr(paise: number): string {
  return `₹${(paise / 100).toFixed(2)}`;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
}

/** Send the 24h pre-debit reminder (amount + date) for a scheduled charge. */
async function sendDebitReminder(row: typeof scheduledCharges.$inferSelect): Promise<void> {
  const contact = await loadContact(row.userId);
  if (!contact.email) return;
  const dateLabel = formatDate(new Date(row.scheduledFor));
  await enqueueEmail({
    eventType: "upcoming_debit_reminder",
    recipient: contact.email,
    subject: `Heads up: ${formatInr(row.totalPaise)} auto-debit on ${dateLabel}`,
    dedupeKey: `debit_reminder:${row.id}`,
    userId: row.userId,
    relatedId: row.id,
    payload: {
      userName: contact.name,
      amountLabel: formatInr(row.totalPaise),
      baseLabel: formatInr(row.basePaise),
      storageLabel: row.storagePaise > 0 ? formatInr(row.storagePaise) : "",
      storageBlocks: row.storageBlocks,
      dateLabel,
      plan: row.plan,
      billingUrl: `${appOrigin()}/dashboard/settings/billing`,
    },
  });
  await db
    .update(scheduledCharges)
    .set({ reminderSentAt: new Date(), status: "reminded", updatedAt: new Date() })
    .where(eq(scheduledCharges.id, row.id));
}

/** Execute one scheduled charge against the mandate token. */
async function executeCharge(row: typeof scheduledCharges.$inferSelect): Promise<void> {
  if (!razorpay) return;
  const [mandate] = await db
    .select()
    .from(autopayMandates)
    .where(eq(autopayMandates.id, row.mandateId))
    .limit(1);
  if (!mandate || mandate.status !== "active" || !mandate.razorpayTokenId) {
    await db
      .update(scheduledCharges)
      .set({ status: "skipped", lastError: "mandate_inactive", updatedAt: new Date() })
      .where(eq(scheduledCharges.id, row.id));
    return;
  }

  const plan = row.plan as PaidPlan;
  // Recompute at charge time so storage overage reflects latest usage.
  const amount = await composeCycleAmount(row.userId, plan, mandate.maxAmountPaise);
  const totalPaise = amount.totalPaise;

  if (totalPaise > mandate.maxAmountPaise) {
    await db
      .update(scheduledCharges)
      .set({ status: "failed", lastError: "exceeds_mandate_max", updatedAt: new Date() })
      .where(eq(scheduledCharges.id, row.id));
    logger.error({ userId: row.userId, totalPaise, max: mandate.maxAmountPaise }, "upiAutopay: charge exceeds mandate max");
    return;
  }

  const contact = await loadContact(row.userId);

  try {
    const order: any = await razorpay.orders.create({
      amount: totalPaise,
      currency: "INR",
      customer_id: mandate.razorpayCustomerId || undefined,
      receipt: `upi_rec_${row.id.slice(0, 8)}_${Date.now()}`.slice(0, 40),
      notes: { userId: row.userId, plan, kind: "upi_autopay_recurring", scheduledChargeId: row.id },
    } as any);

    await db
      .update(scheduledCharges)
      .set({
        razorpayOrderId: order.id,
        basePaise: amount.basePaise,
        storagePaise: amount.storagePaise,
        storageBlocks: amount.storageBlocks,
        totalPaise,
        updatedAt: new Date(),
      })
      .where(eq(scheduledCharges.id, row.id));

    const result: any = await razorpay.payments.createRecurringPayment({
      email: contact.email,
      contact: contact.phone,
      amount: totalPaise,
      currency: "INR",
      order_id: order.id,
      customer_id: mandate.razorpayCustomerId as string,
      token: mandate.razorpayTokenId,
      recurring: "1",
      notes: { userId: row.userId, plan, scheduledChargeId: row.id },
    } as any);

    const paymentId = result?.razorpay_payment_id || null;

    // Success is confirmed asynchronously via webhook (payment.captured), but we
    // optimistically extend so entitlements never lapse; webhook reconciles.
    const expiresAt = await getRenewalExpiry(row.userId, plan);
    await activatePaidPlan(row.userId, plan, expiresAt, { subscriptionId: null, planId: null });

    const period = planBillingPeriod(plan);
    const nextChargeAt = period === "lifetime" ? null : expiresAt;

    await db
      .update(autopayMandates)
      .set({
        currentPeriodStart: new Date(),
        currentPeriodEnd: expiresAt,
        nextChargeAt,
        lastChargeAt: new Date(),
        lastChargeStatus: "charged",
        failureCount: 0,
        updatedAt: new Date(),
      })
      .where(eq(autopayMandates.id, mandate.id));

    await db
      .update(scheduledCharges)
      .set({ status: "success", razorpayPaymentId: paymentId, updatedAt: new Date() })
      .where(eq(scheduledCharges.id, row.id));

    await db.insert(payments).values({
      userId: row.userId,
      razorpayOrderId: order.id,
      razorpayPaymentId: paymentId,
      amount: totalPaise,
      status: "success",
      plan,
      kind: "subscription",
    });

    await recordLedger({
      userId: row.userId,
      eventType: "upi_autopay_charged",
      amountPaise: totalPaise,
      plan,
      razorpayPaymentId: paymentId,
      razorpayOrderId: order.id,
      idempotencyKey: `upi_charge:${row.id}`,
      metadata: { basePaise: amount.basePaise, storagePaise: amount.storagePaise, blocks: amount.storageBlocks },
    });

    try {
      await sendBillingReceipts(row.userId, plan, totalPaise / 100, paymentId || order.id);
    } catch (err) {
      logger.warn({ err, userId: row.userId }, "upiAutopay: recurring receipt failed");
    }

    if (nextChargeAt) await ensureScheduledCharge(mandate.id, row.userId, plan, nextChargeAt);
    logger.info({ userId: row.userId, plan, totalPaise, paymentId }, "upiAutopay: recurring charge submitted");
  } catch (err: any) {
    const attempts = (row.attemptCount || 0) + 1;
    const failed = attempts >= CHARGE_MAX_ATTEMPTS;
    await db
      .update(scheduledCharges)
      .set({
        status: failed ? "failed" : "scheduled",
        attemptCount: attempts,
        lastError: String(err?.error?.description || err?.message || err).slice(0, 500),
        // back off ~6h between retries
        scheduledFor: failed ? row.scheduledFor : new Date(Date.now() + 6 * 60 * 60 * 1000),
        claimedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(scheduledCharges.id, row.id));

    if (failed) {
      await db
        .update(autopayMandates)
        .set({ lastChargeStatus: "failed", failureCount: sql`${autopayMandates.failureCount} + 1`, updatedAt: new Date() })
        .where(eq(autopayMandates.id, mandate.id));
      // Reuse existing dunning email pipeline.
      const contactInfo = await loadContact(row.userId);
      if (contactInfo.email) {
        await enqueueEmail({
          eventType: "payment_failed",
          recipient: contactInfo.email,
          subject: "Action needed: your BEXO auto-payment failed",
          dedupeKey: `upi_charge_failed:${row.id}`,
          userId: row.userId,
          payload: {
            userName: contactInfo.name,
            billingUrl: `${appOrigin()}/dashboard/settings/billing`,
            dayBucket: 0,
          },
        });
      }
    }
    logger.error({ err, userId: row.userId, attempts, failed }, "upiAutopay: recurring charge failed");
  }
}

/**
 * One tick of the billing loop. Safe to run on every instance concurrently —
 * rows are claimed with SKIP LOCKED and charges are idempotent. Handles:
 *  1) reminders  — send 24h pre-debit notice for due scheduled charges
 *  2) charges    — debit scheduled charges whose time has arrived
 */
export async function runUpiAutopayTick(): Promise<{ reminded: number; charged: number }> {
  if (!isUpiAutopayEnabled() || !razorpay) return { reminded: 0, charged: 0 };
  const now = new Date();
  let reminded = 0;
  let charged = 0;

  // 1) Reminders — anything debiting within the lead window, not yet reminded.
  try {
    const reminderCutoff = new Date(now.getTime() + REMINDER_LEAD_MS);
    const dueReminders = await db
      .select()
      .from(scheduledCharges)
      .where(
        and(
          eq(scheduledCharges.status, "scheduled"),
          isNull(scheduledCharges.reminderSentAt),
          lte(scheduledCharges.scheduledFor, reminderCutoff),
        ),
      )
      .limit(200);
    for (const row of dueReminders) {
      try {
        await sendDebitReminder(row);
        reminded += 1;
      } catch (err) {
        logger.warn({ err, id: row.id }, "upiAutopay: reminder failed");
      }
    }
  } catch (err) {
    logger.error({ err }, "upiAutopay: reminder sweep failed");
  }

  // 2) Charges — claim due rows atomically (SKIP LOCKED), then execute.
  try {
    const claimed = await db.execute(sql`
      UPDATE scheduled_charges
      SET status = 'charging', claimed_at = now(), updated_at = now()
      WHERE id IN (
        SELECT id FROM scheduled_charges
        WHERE status IN ('scheduled', 'reminded')
          AND scheduled_for <= now()
        ORDER BY scheduled_for ASC
        LIMIT 50
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id
    `);
    const rows = (claimed as any).rows || (claimed as any) || [];
    for (const r of rows) {
      const [row] = await db.select().from(scheduledCharges).where(eq(scheduledCharges.id, r.id)).limit(1);
      if (!row) continue;
      await executeCharge(row);
      charged += 1;
    }
  } catch (err) {
    logger.error({ err }, "upiAutopay: charge sweep failed");
  }

  return { reminded, charged };
}

/** Cancel the mandate at period end (keeps access until currentPeriodEnd). */
export async function cancelMandate(userId: string): Promise<boolean> {
  const [mandate] = await db
    .select()
    .from(autopayMandates)
    .where(eq(autopayMandates.userId, userId))
    .limit(1);
  if (!mandate) return false;
  await db
    .update(autopayMandates)
    .set({ status: "revoked", nextChargeAt: null, updatedAt: new Date() })
    .where(eq(autopayMandates.id, mandate.id));
  await db
    .update(scheduledCharges)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(and(eq(scheduledCharges.mandateId, mandate.id), or(eq(scheduledCharges.status, "scheduled"), eq(scheduledCharges.status, "reminded"))));
  return true;
}

/** Dashboard summary of the active mandate + next debit. */
export async function getMandateSummary(userId: string) {
  const [mandate] = await db
    .select()
    .from(autopayMandates)
    .where(eq(autopayMandates.userId, userId))
    .limit(1);
  if (!mandate) return null;
  const [next] = await db
    .select()
    .from(scheduledCharges)
    .where(
      and(
        eq(scheduledCharges.mandateId, mandate.id),
        or(eq(scheduledCharges.status, "scheduled"), eq(scheduledCharges.status, "reminded")),
      ),
    )
    .orderBy(scheduledCharges.scheduledFor)
    .limit(1);
  return {
    status: mandate.status,
    plan: mandate.plan,
    maxAmountPaise: mandate.maxAmountPaise,
    nextChargeAt: mandate.nextChargeAt,
    upcomingCharge: next
      ? { amountPaise: next.totalPaise, storagePaise: next.storagePaise, scheduledFor: next.scheduledFor }
      : null,
  };
}

/**
 * Fire a one-off recurring debit against the user's live UPI Autopay token.
 * Uses the same Razorpay createRecurringPayment path as monthly renewals.
 *
 * Does NOT extend the paid period and does NOT touch the next scheduled
 * renewal — safe for ₹1 / small verification tests.
 */
export async function runTestRecurringCharge(opts: {
  userId: string;
  amountPaise?: number;
  note?: string;
}): Promise<
  | { ok: true; orderId: string; paymentId: string | null; amountPaise: number; tokenId: string; plan: string }
  | { ok: false; error: string; code: string }
> {
  if (!razorpay) return { ok: false, error: "Razorpay not configured", code: "RAZORPAY_MISSING" };

  const amountPaise = Math.max(100, Math.floor(opts.amountPaise ?? 100)); // min ₹1
  const [mandate] = await db
    .select()
    .from(autopayMandates)
    .where(eq(autopayMandates.userId, opts.userId))
    .limit(1);

  if (!mandate || mandate.status !== "active" || !mandate.razorpayTokenId) {
    return { ok: false, error: "No active UPI Autopay mandate for this user", code: "MANDATE_INACTIVE" };
  }
  if (!mandate.razorpayCustomerId) {
    return { ok: false, error: "Mandate is missing Razorpay customer id", code: "CUSTOMER_MISSING" };
  }
  if (amountPaise > mandate.maxAmountPaise) {
    return {
      ok: false,
      error: `Amount ₹${(amountPaise / 100).toFixed(2)} exceeds mandate ceiling ₹${(mandate.maxAmountPaise / 100).toFixed(2)}`,
      code: "EXCEEDS_MANDATE_MAX",
    };
  }

  const contact = await loadContact(opts.userId);
  if (!contact.email && !contact.phone) {
    return { ok: false, error: "User has no email/phone for the recurring charge", code: "CONTACT_MISSING" };
  }

  const stamp = Date.now();
  const order: any = await razorpay.orders.create({
    amount: amountPaise,
    currency: "INR",
    customer_id: mandate.razorpayCustomerId,
    receipt: `upi_test_${stamp}`.slice(0, 40),
    notes: {
      userId: opts.userId,
      plan: mandate.plan,
      kind: "upi_autopay_test",
      note: (opts.note || "manual ₹1 Autopay engine test").slice(0, 200),
    },
  } as any);

  let paymentId: string | null = null;
  try {
    const result: any = await razorpay.payments.createRecurringPayment({
      email: contact.email || undefined,
      contact: contact.phone || undefined,
      amount: amountPaise,
      currency: "INR",
      order_id: order.id,
      customer_id: mandate.razorpayCustomerId,
      token: mandate.razorpayTokenId,
      recurring: "1",
      notes: {
        userId: opts.userId,
        plan: mandate.plan,
        kind: "upi_autopay_test",
      },
    } as any);
    paymentId = result?.razorpay_payment_id || result?.payment_id || null;
  } catch (err: any) {
    const desc = String(err?.error?.description || err?.message || err).slice(0, 500);
    logger.error({ err, userId: opts.userId, orderId: order.id }, "upiAutopay: test charge failed");
    await recordLedger({
      userId: opts.userId,
      eventType: "upi_autopay_test_failed",
      amountPaise,
      plan: mandate.plan,
      razorpayOrderId: order.id,
      idempotencyKey: `upi_test_fail:${order.id}`,
      metadata: { error: desc },
    });
    return { ok: false, error: desc || "Recurring charge failed", code: "CHARGE_FAILED" };
  }

  // Record only — do not activatePaidPlan / move nextChargeAt (test must not gift a month).
  // payments.kind is constrained; use subscription + ledger event for the test marker.
  try {
    await db.insert(payments).values({
      userId: opts.userId,
      razorpayOrderId: order.id,
      razorpayPaymentId: paymentId,
      amount: amountPaise,
      status: "success",
      plan: mandate.plan,
      kind: "subscription",
    });
  } catch (err) {
    logger.warn({ err, orderId: order.id, paymentId }, "upiAutopay: test payment row insert failed (charge already submitted)");
  }

  await db
    .update(autopayMandates)
    .set({
      lastChargeAt: new Date(),
      lastChargeStatus: "test_charged",
      failureCount: 0,
      updatedAt: new Date(),
    })
    .where(eq(autopayMandates.id, mandate.id));

  await recordLedger({
    userId: opts.userId,
    eventType: "upi_autopay_test_charged",
    amountPaise,
    plan: mandate.plan,
    razorpayPaymentId: paymentId,
    razorpayOrderId: order.id,
    idempotencyKey: `upi_test:${order.id}`,
    metadata: { note: opts.note || "manual test", tokenId: mandate.razorpayTokenId },
  });

  try {
    await sendBillingReceipts(opts.userId, `${mandate.plan} (test)`, amountPaise / 100, paymentId || order.id);
  } catch (err) {
    logger.warn({ err, userId: opts.userId }, "upiAutopay: test receipt failed");
  }

  logger.info(
    { userId: opts.userId, amountPaise, orderId: order.id, paymentId },
    "upiAutopay: test recurring charge submitted",
  );

  return {
    ok: true,
    orderId: order.id,
    paymentId,
    amountPaise,
    tokenId: mandate.razorpayTokenId,
    plan: mandate.plan,
  };
}
