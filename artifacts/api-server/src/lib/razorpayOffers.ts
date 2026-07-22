import { logger } from "./logger";
import {
  findActiveCoupon,
  setCouponRazorpayOfferId,
  type CouponRow,
  type PricingBreakdown,
} from "./pricingCatalog";

type RazorpayLike = any;

async function createOfferViaRest(payload: Record<string, unknown>): Promise<{ id: string } | null> {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) return null;

  const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
  const res = await fetch("https://api.razorpay.com/v1/offers", {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const body: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    logger.warn({ status: res.status, body }, "Razorpay offers REST create failed");
    return null;
  }
  if (typeof body?.id === "string") return { id: body.id };
  return null;
}

/**
 * Ensure a Razorpay Offer exists that knocks first-invoice total down to `first.totalPaise`.
 * Flat paise discount = listTotal - firstTotal so all coupon types map cleanly.
 * Offer is cached on pricing_coupons.razorpay_offer_id.
 */
export async function ensureRazorpayOfferForCoupon(opts: {
  razorpay: RazorpayLike;
  coupon: CouponRow;
  list: PricingBreakdown;
  first: PricingBreakdown;
  planDisplayName: string;
}): Promise<string | null> {
  const { razorpay, coupon, list, first, planDisplayName } = opts;
  const discountPaise = Math.max(0, list.totalPaise - first.totalPaise);
  if (discountPaise <= 0) return null;

  if (coupon.razorpayOfferId) {
    return coupon.razorpayOfferId;
  }

  const code = coupon.code.toUpperCase();
  const nowSec = Math.floor(Date.now() / 1000);
  const endSec = nowSec + 365 * 24 * 60 * 60;

  const payload: Record<string, unknown> = {
    name: `Bexo ${code}`.slice(0, 50),
    display_text: `${code} first invoice`.slice(0, 50),
    terms: `Applies once to the first ${planDisplayName} charge. Later invoices are at full plan price.`,
    description: `First-invoice discount for coupon ${code}`,
    type: "instant",
    discount: {
      type: "flat",
      amount: discountPaise,
    },
    period: {
      start: nowSec,
      end: endSec,
    },
  };

  try {
    let offer: { id: string } | null = null;
    if (razorpay.offers?.create) {
      try {
        offer = await razorpay.offers.create(payload);
      } catch (sdkErr) {
        logger.warn({ error: sdkErr, code }, "Razorpay SDK offers.create failed; trying REST");
      }
    }
    if (!offer?.id) {
      offer = await createOfferViaRest(payload);
    }
    if (offer?.id) {
      await setCouponRazorpayOfferId(coupon.id, offer.id);
      return offer.id;
    }
  } catch (error) {
    logger.error({ error, code, discountPaise }, "Failed to create Razorpay offer for coupon");
  }
  return null;
}

export async function resolveCouponOfferId(opts: {
  razorpay: RazorpayLike | null;
  couponCode?: string | null;
  list: PricingBreakdown;
  first: PricingBreakdown;
  planDisplayName: string;
}): Promise<{ coupon: CouponRow | null; offerId: string | null }> {
  const coupon = await findActiveCoupon(opts.couponCode);
  if (!coupon || !opts.razorpay) return { coupon, offerId: null };
  if (opts.first.totalPaise >= opts.list.totalPaise) return { coupon, offerId: null };

  const offerId = await ensureRazorpayOfferForCoupon({
    razorpay: opts.razorpay,
    coupon,
    list: opts.list,
    first: opts.first,
    planDisplayName: opts.planDisplayName,
  });
  return { coupon, offerId };
}
