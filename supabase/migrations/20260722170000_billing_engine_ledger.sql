-- Billing engine: payment statuses for hard Autopay mandate + ledger + webhook inbox

-- Expand payments.status vocabulary (no check constraint historically; document via comment)
COMMENT ON COLUMN payments.status IS
  'pending | awaiting_mandate | success | failed | abandoned | refunded';

CREATE TABLE IF NOT EXISTS billing_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  payment_id uuid REFERENCES payments(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  amount_paise integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'INR',
  plan text,
  razorpay_payment_id text,
  razorpay_order_id text,
  razorpay_subscription_id text,
  razorpay_refund_id text,
  idempotency_key text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT billing_ledger_idempotency_key_unique UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS billing_ledger_user_created_idx
  ON billing_ledger (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS billing_ledger_payment_idx
  ON billing_ledger (payment_id) WHERE payment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS billing_ledger_event_type_idx
  ON billing_ledger (event_type);

CREATE TABLE IF NOT EXISTS razorpay_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  processing_status text NOT NULL DEFAULT 'processed',
  error text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  CONSTRAINT razorpay_webhook_events_event_id_unique UNIQUE (event_id)
);

CREATE INDEX IF NOT EXISTS razorpay_webhook_events_type_idx
  ON razorpay_webhook_events (event_type, received_at DESC);
