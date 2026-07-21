# Razorpay Autopay (Yearly Subscriptions) — Setup Guide

BEXO now bills the two paid plans differently:

| Plan | Billing | Razorpay product | Price (ex-GST) | Total with 18% GST |
|------|---------|------------------|----------------|--------------------|
| Yearly | Auto-renews every year | **Subscriptions** | ₹799 | ₹943 |
| Lifetime | One-time payment | Orders (unchanged) | ₹1999 | ₹2359 |

The code is already deployed. Yearly checkout calls `POST /api/payments/create-subscription`,
which needs a Razorpay **Plan id** in the environment. Until `RAZORPAY_PLAN_ID_ANNUAL` is set,
Yearly checkout automatically falls back to a one-time order, so nothing breaks — but autopay
only starts working after you finish the steps below.

## 1. Enable Subscriptions on your Razorpay account

1. Log in to the [Razorpay Dashboard](https://dashboard.razorpay.com).
2. Go to **Account & Settings → Products** (or ask support via the chat widget).
3. Enable **Subscriptions / Recurring payments**. Approval is usually instant for
   test mode; live mode may need KYC review.
4. UPI Autopay + cards + e-mandate become available per your account settings.

## 2. Create the Yearly Plan

1. Dashboard → **Subscriptions → Plans → Create Plan**.
2. Fill in:
   - **Plan name:** `BEXO Yearly`
   - **Billing frequency:** `Yearly`, billing interval `1`
   - **Amount:** `₹943` (this is ₹799 + 18% GST — Razorpay charges the plan amount
     as-is, so the amount must be **tax-inclusive**: `Math.round(799 * 1.18) = 943`)
   - **Currency:** INR
3. Save and copy the plan id — it looks like `plan_XXXXXXXXXXXXXX`.

> Important: the API compares the Razorpay plan amount with the catalog price
> (`pricing_plans.price_inr_ex_gst = 799` + GST) on every checkout and rejects a
> mismatch. If you ever change the price in Supabase, create a new Razorpay plan
> and update the env var.

## 3. Set the Cloud Run environment variables

Add to the `bexo-api` Cloud Run service (Console → Cloud Run → bexo-api → Edit & Deploy
New Revision → Variables):

```
RAZORPAY_PLAN_ID_ANNUAL=plan_XXXXXXXXXXXXXX
RAZORPAY_WEBHOOK_SECRET=<from step 4>
```

Or via gcloud:

```bash
gcloud run services update bexo-api \
  --region <your-region> \
  --update-env-vars RAZORPAY_PLAN_ID_ANNUAL=plan_XXXXXXXXXXXXXX,RAZORPAY_WEBHOOK_SECRET=<secret>
```

## 4. Configure the webhook

Webhooks are the source of truth for renewals (the browser is not open when a
subscription auto-charges next year).

1. Dashboard → **Account & Settings → Webhooks → Add New Webhook**.
2. **Webhook URL:** `https://mybexo.cyou/api/payments/webhook`
3. **Secret:** generate a strong random string — this becomes `RAZORPAY_WEBHOOK_SECRET`.
4. Select these events:
   - `payment.captured` (lifetime one-time orders)
   - `payment.failed`
   - `subscription.activated`
   - `subscription.charged` (yearly renewals — extends expiry by reading `current_end`)
   - `subscription.cancelled`
   - `subscription.halted`
   - `subscription.completed`
5. Save, then put the secret into Cloud Run (step 3) and redeploy.

## 5. Test mode first

1. Switch the dashboard to **Test Mode** and repeat steps 2–4 with test keys
   (`rzp_test_...`) and a test plan; point env vars at the test values.
2. Run a Yearly checkout on the site with test UPI/card. Verify:
   - Subscription shows in Razorpay → Subscriptions.
   - Premium activates (templates, subdomain unlock).
   - `payments` table row has `kind = 'subscription'` and the subscription id.
   - `subscriptions.razorpay_subscription_id` is stored; Billing UI shows “Auto-renew on”.
3. Simulate `subscription.charged` from the webhook page and confirm `expires_at`
   extends.
4. Switch back to **Live Mode**, create the live plan + webhook, update env vars
   with live values, redeploy.

## 6. Redeploy after env changes

```bash
# API (Cloud Run) — from repo root
gcloud run deploy bexo-api ...   # or your usual deploy pipeline

# Hosting (static frontend)
firebase deploy --only hosting
```

## How the flows work (reference)

- **Yearly:** `create-subscription` → Razorpay Checkout with `subscription_id` →
  `verify-subscription` (signature = HMAC(payment_id|subscription_id)) → premium
  active with `expires_at = current_end`. Renewals: `subscription.charged` webhook
  inserts a payment row and extends `expires_at`.
- **Lifetime:** `create-order` → Checkout with `order_id` → `verify`
  (signature = HMAC(order_id|payment_id)) → premium forever, no expiry.
- **Cancelling autopay:** cancel the subscription from the Razorpay dashboard
  (Subscriptions → … → Cancel). The `subscription.cancelled` webhook clears the
  autopay flag; the user keeps access until the paid-up date.
- **Coupons:** `EARLYBIRD` locks Yearly ₹799 / Lifetime ₹1999 (same as list price
  today, so the plan amount still matches; if you later raise list prices, the
  coupon-discounted total must equal the Razorpay plan amount or Yearly coupon
  checkouts will be rejected with `PLAN_AMOUNT_MISMATCH`).
