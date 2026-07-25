-- UPI Autopay engine: Orders + recurring-token model.
-- Adds a high-ceiling mandate (max_amount up to ₹2000) per user that funds the
-- base plan AND usage-based storage overage in a single monthly debit, plus a
-- merchant-run scheduled-charge loop with 24h pre-debit reminders.
-- Additive only — the legacy Razorpay Subscriptions flow is unaffected.

BEGIN;

CREATE TABLE IF NOT EXISTS autopay_mandates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  plan text NOT NULL,
  method text NOT NULL DEFAULT 'upi',
  razorpay_customer_id text,
  razorpay_token_id text UNIQUE,
  auth_order_id text,
  auth_payment_id text,
  max_amount_paise integer NOT NULL DEFAULT 200000,
  status text NOT NULL DEFAULT 'pending_authorization',
  current_period_start timestamptz,
  current_period_end timestamptz,
  next_charge_at timestamptz,
  token_expires_at timestamptz,
  last_charge_at timestamptz,
  last_charge_status text,
  failure_count integer NOT NULL DEFAULT 0,
  coupon_code text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS scheduled_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mandate_id uuid NOT NULL REFERENCES autopay_mandates(id) ON DELETE CASCADE,
  razorpay_token_id text,
  plan text NOT NULL,
  kind text NOT NULL DEFAULT 'renewal',
  base_paise integer NOT NULL DEFAULT 0,
  storage_paise integer NOT NULL DEFAULT 0,
  storage_blocks integer NOT NULL DEFAULT 0,
  total_paise integer NOT NULL,
  scheduled_for timestamptz NOT NULL,
  reminder_sent_at timestamptz,
  status text NOT NULL DEFAULT 'scheduled',
  attempt_count integer NOT NULL DEFAULT 0,
  razorpay_order_id text,
  razorpay_payment_id text,
  claimed_at timestamptz,
  last_error text,
  idempotency_key text UNIQUE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Queue lookup: due charges that still need a reminder or a debit.
CREATE INDEX IF NOT EXISTS idx_scheduled_charges_due
  ON scheduled_charges (status, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_scheduled_charges_user
  ON scheduled_charges (user_id);
CREATE INDEX IF NOT EXISTS idx_autopay_mandates_next_charge
  ON autopay_mandates (status, next_charge_at);

-- RLS: server (service role) only. Public/anon has no access.
ALTER TABLE autopay_mandates ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_charges ENABLE ROW LEVEL SECURITY;

COMMIT;
