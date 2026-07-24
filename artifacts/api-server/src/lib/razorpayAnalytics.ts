/**
 * Razorpay live analytics for Admin dashboard.
 */
import Razorpay from "razorpay";
import { logger } from "./logger";

export type RzpDayPoint = { day: string; value: number; count?: number };

function getClient(): Razorpay | null {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) return null;
  return new Razorpay({ key_id: keyId, key_secret: keySecret });
}

function dayKey(unixSec: number): string {
  return new Date(unixSec * 1000).toISOString().slice(0, 10);
}

type RzpPayment = {
  id: string;
  amount: number;
  currency?: string;
  status: string;
  method?: string;
  email?: string;
  contact?: string;
  created_at: number;
  error_code?: string | null;
  error_description?: string | null;
  fee?: number;
  tax?: number;
};

async function fetchPaymentsWindow(
  rzp: Razorpay,
  fromSec: number,
  toSec: number,
): Promise<RzpPayment[]> {
  const items: RzpPayment[] = [];
  let skip = 0;
  // Razorpay caps count at 100 per page
  for (let page = 0; page < 20; page++) {
    const res = (await rzp.payments.all({
      from: fromSec,
      to: toSec,
      count: 100,
      skip,
    })) as { items?: RzpPayment[]; count?: number };
    const batch = res.items || [];
    items.push(...batch);
    if (batch.length < 100) break;
    skip += batch.length;
  }
  return items;
}

export async function loadRazorpayAnalytics(days = 30): Promise<{
  configured: boolean;
  mode: "live" | "test" | "off";
  error: string | null;
  kpis: Record<string, number>;
  revenueSeries: RzpDayPoint[];
  countSeries: RzpDayPoint[];
  statusMix: { status: string; count: number; amountInr: number }[];
  methodMix: { method: string; count: number; amountInr: number }[];
  recent: {
    id: string;
    amountInr: number;
    status: string;
    method: string;
    createdAt: string;
    email: string | null;
  }[];
  consoleLinks: Record<string, string>;
}> {
  const keyId = process.env.RAZORPAY_KEY_ID || "";
  const mode = !keyId ? "off" : keyId.startsWith("rzp_live") ? "live" : "test";
  const consoleLinks = {
    payments: "https://dashboard.razorpay.com/app/payments",
    settlements: "https://dashboard.razorpay.com/app/settlements",
    subscriptions: "https://dashboard.razorpay.com/app/subscriptions",
    refunds: "https://dashboard.razorpay.com/app/refunds",
  };

  const rzp = getClient();
  if (!rzp) {
    return {
      configured: false,
      mode: "off",
      error: "RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET not configured",
      kpis: {},
      revenueSeries: [],
      countSeries: [],
      statusMix: [],
      methodMix: [],
      recent: [],
      consoleLinks,
    };
  }

  try {
    const toSec = Math.floor(Date.now() / 1000);
    const fromSec = toSec - days * 86400;
    const payments = await fetchPaymentsWindow(rzp, fromSec, toSec);

    const revenueByDay = new Map<string, { value: number; count: number }>();
    const statusMap = new Map<string, { count: number; amountInr: number }>();
    const methodMap = new Map<string, { count: number; amountInr: number }>();

    let capturedInr = 0;
    let failedCount = 0;
    let refundedInr = 0;
    let authorizedInr = 0;

    for (const p of payments) {
      const amountInr = (p.amount || 0) / 100;
      const day = dayKey(p.created_at);
      const st = p.status || "unknown";
      const method = p.method || "unknown";

      const stRow = statusMap.get(st) || { count: 0, amountInr: 0 };
      stRow.count += 1;
      stRow.amountInr += amountInr;
      statusMap.set(st, stRow);

      const mRow = methodMap.get(method) || { count: 0, amountInr: 0 };
      mRow.count += 1;
      mRow.amountInr += amountInr;
      methodMap.set(method, mRow);

      if (st === "captured") {
        capturedInr += amountInr;
        const d = revenueByDay.get(day) || { value: 0, count: 0 };
        d.value += amountInr;
        d.count += 1;
        revenueByDay.set(day, d);
      } else if (st === "failed") {
        failedCount += 1;
      } else if (st === "refunded") {
        refundedInr += amountInr;
      } else if (st === "authorized") {
        authorizedInr += amountInr;
      }
    }

    // Fill missing days
    const revenueSeries: RzpDayPoint[] = [];
    const countSeries: RzpDayPoint[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      const row = revenueByDay.get(d) || { value: 0, count: 0 };
      revenueSeries.push({ day: d, value: Math.round(row.value * 100) / 100, count: row.count });
      countSeries.push({ day: d, value: row.count });
    }

    const recent = [...payments]
      .sort((a, b) => b.created_at - a.created_at)
      .slice(0, 25)
      .map((p) => ({
        id: p.id,
        amountInr: Math.round((p.amount || 0) / 100),
        status: p.status,
        method: p.method || "—",
        createdAt: new Date(p.created_at * 1000).toISOString(),
        email: p.email || null,
      }));

    return {
      configured: true,
      mode,
      error: null,
      kpis: {
        paymentsFetched: payments.length,
        capturedInr: Math.round(capturedInr),
        failedCount,
        refundedInr: Math.round(refundedInr),
        authorizedInr: Math.round(authorizedInr),
        successRate:
          payments.length > 0
            ? Math.round(
                (payments.filter((p) => p.status === "captured").length / payments.length) * 1000,
              ) / 10
            : 0,
      },
      revenueSeries,
      countSeries,
      statusMix: [...statusMap.entries()].map(([status, v]) => ({
        status,
        count: v.count,
        amountInr: Math.round(v.amountInr),
      })),
      methodMix: [...methodMap.entries()].map(([method, v]) => ({
        method,
        count: v.count,
        amountInr: Math.round(v.amountInr),
      })),
      recent,
      consoleLinks,
    };
  } catch (err) {
    logger.error({ err }, "Razorpay analytics failed");
    return {
      configured: false,
      mode,
      error: (err as Error).message,
      kpis: {},
      revenueSeries: [],
      countSeries: [],
      statusMix: [],
      methodMix: [],
      recent: [],
      consoleLinks,
    };
  }
}
