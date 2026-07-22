-- Per-user billing profile for checkout, invoices, and Autopay receipts.
CREATE TABLE IF NOT EXISTS billing_profiles (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  email text NOT NULL,
  phone text NOT NULL,
  line1 text NOT NULL,
  line2 text,
  city text NOT NULL,
  state text NOT NULL,
  postal_code text NOT NULL,
  country text NOT NULL DEFAULT 'IN',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS billing_profiles_email_idx ON billing_profiles (lower(email));
CREATE INDEX IF NOT EXISTS billing_profiles_updated_idx ON billing_profiles (updated_at DESC);

COMMENT ON TABLE billing_profiles IS
  'Customer billing identity used for Razorpay prefill, tax invoices, and monthly Autopay records.';
