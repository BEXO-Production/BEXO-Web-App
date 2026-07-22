# BEXO Billing Engine

Integrated into `artifacts/api-server` (not a separate microservice). Razorpay remains the payment rail; this engine owns lifecycle, bookkeeping, and gates.

## Hard Autopay mandate (coupon / bootstrap)

1. User pays discounted first invoice → payment status `awaiting_mandate` (not premium).
2. Engine schedules a delayed Razorpay subscription (`start_at` ≥ ~28 days for monthly / period end).
3. User must authorize Autopay in Checkout (`confirm-autopay`) → then `activatePaidPlan`, coupon redemption, invoice, receipts.
4. If user closes Autopay → cancel pending subscription, **refund** first invoice, status `refunded`/`abandoned`. No silent premium.

### Coupon billing rule (no blend / double charge)

| When | What is charged |
|------|-----------------|
| **First month (coupon)** | Only the coupon total (e.g. ₹1 + GST = ₹1.18) via Razorpay **order** |
| **Next cycles** | Full plan list price (e.g. Identity ₹59 + GST = ₹69.62) via delayed Autopay |

- Discounted checkouts **always** use `subscription_bootstrap` (never an immediate full-price subscription).
- Autopay `start_at` is forced at least one billing period ahead so authorizing the mandate does **not** collect the full plan the same day.
- No-coupon checkouts still charge full price on first subscription invoice (expected).

## Ledger (`billing_ledger`)

Append-only events with unique `idempotency_key`:

- `first_invoice_captured`, `mandate_required`, `mandate_confirmed`, `mandate_abandoned`
- `plan_activated`, `plan_renewed`, `payment_refunded`, `subscription_cancelled`

## Webhook inbox (`razorpay_webhook_events`)

Dedupes by Razorpay `event.id` so retries cannot double-activate or double-email.

## Daily job (`POST /api/payments/jobs/daily`)

Auth: `x-cron-secret` = `CRON_SECRET` or `INTERNAL_JOB_SECRET`.

Runs:

- grace expiry + dunning
- portfolio rollups
- **stale `awaiting_mandate` sweep** (24h TTL → cancel sub + refund)

Wire Cloud Scheduler (or similar) to hit this endpoint daily in production.

## Customer billing profile (`billing_profiles`)

Collected once at checkout (name, email, phone, address). One row per user.

- Validated + sanitized before upsert (`artifacts/api-server/src/lib/billingProfile.ts`)
- Required on `create-order` / `create-subscription` / `create-addon-subscription`
- Prefills Razorpay Checkout; fills tax invoice BILL TO on renewals
- API: `GET` / `PUT` `/api/payments/billing-profile`

Migration: `supabase/migrations/20260722180000_billing_profiles.sql`

## Key modules

- [`artifacts/api-server/src/lib/billingEngine/index.ts`](../artifacts/api-server/src/lib/billingEngine/index.ts)
- [`artifacts/api-server/src/lib/billingProfile.ts`](../artifacts/api-server/src/lib/billingProfile.ts)
- [`artifacts/api-server/src/routes/payments.ts`](../artifacts/api-server/src/routes/payments.ts)
- Migrations: `20260722170000_billing_engine_ledger.sql`, `20260722180000_billing_profiles.sql`
