-- BEXO full schema reconcile (idempotent)
-- Ensures every table/column/index used by api-server + Admin exists on Supabase.

-- ========== CORE ==========
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL UNIQUE,
  phone_verified_at timestamptz,
  email text UNIQUE,
  oauth_provider text,
  oauth_id text,
  name text,
  dob date,
  photo_url text,
  resume_url text,
  generated_resume_url text,
  default_resume text NOT NULL DEFAULT 'generated',
  profile_photo_asset_id uuid,
  storage_used_bytes bigint DEFAULT 0,
  storage_quota_bytes bigint DEFAULT 10485760,
  storage_bonus_bytes bigint DEFAULT 0,
  open_to_hire boolean DEFAULT false,
  template_id text DEFAULT 'minimal',
  theme_color text DEFAULT 'blue',
  theme_bg text DEFAULT 'grid',
  resume_parses_this_month integer DEFAULT 0,
  last_resume_parse_reset timestamptz DEFAULT now(),
  updates_this_month integer NOT NULL DEFAULT 0,
  last_updates_reset timestamptz DEFAULT now(),
  onboarding_successful_parses integer DEFAULT 0,
  onboarding_completed_at timestamptz,
  last_onboarding_activity_at timestamptz,
  site_status text NOT NULL DEFAULT 'live',
  pause_reason text,
  grace_until timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  payment_failed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS generated_resume_url text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS default_resume text NOT NULL DEFAULT 'generated';
ALTER TABLE users ADD COLUMN IF NOT EXISTS storage_bonus_bytes bigint DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS updates_this_month integer NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_updates_reset timestamptz DEFAULT now();
ALTER TABLE users ADD COLUMN IF NOT EXISTS site_status text NOT NULL DEFAULT 'live';
ALTER TABLE users ADD COLUMN IF NOT EXISTS pause_reason text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS grace_until timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS cancel_at_period_end boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS payment_failed_at timestamptz;

CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES users(id),
  handle text UNIQUE,
  headline text,
  career_goal text,
  bio text,
  completion_pct integer DEFAULT 0,
  subdomain text UNIQUE,
  template_id text DEFAULT 'minimal',
  is_premium boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS handle text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS subdomain text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS template_id text DEFAULT 'minimal';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_premium boolean DEFAULT false;

CREATE TABLE IF NOT EXISTS profile_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES profiles(id),
  type text NOT NULL,
  entries jsonb DEFAULT '[]'::jsonb,
  reviewed_at timestamptz,
  CONSTRAINT profile_type_unique UNIQUE (profile_id, type)
);

CREATE TABLE IF NOT EXISTS assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  name text NOT NULL,
  url text NOT NULL,
  size_bytes integer NOT NULL,
  section_type text,
  entry_id text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS templates (
  id text PRIMARY KEY,
  name text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'general',
  premium boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  engine text NOT NULL DEFAULT 'bundle',
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE templates ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'general';
ALTER TABLE templates ADD COLUMN IF NOT EXISTS premium boolean NOT NULL DEFAULT false;
ALTER TABLE templates ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE templates ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;
ALTER TABLE templates ADD COLUMN IF NOT EXISTS engine text NOT NULL DEFAULT 'bundle';
ALTER TABLE templates ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

CREATE TABLE IF NOT EXISTS theme_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id text NOT NULL REFERENCES templates(id),
  name text NOT NULL,
  tokens jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS portfolios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES users(id),
  handle text NOT NULL UNIQUE,
  selected_template_id text REFERENCES templates(id),
  selected_theme_id text,
  is_published boolean DEFAULT false,
  published_at timestamptz,
  draft_preview_token text UNIQUE,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS activation_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  status text DEFAULT 'unused',
  redeemed_by uuid REFERENCES users(id),
  redeemed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES users(id),
  plan text NOT NULL,
  status text NOT NULL,
  expires_at timestamptz,
  razorpay_subscription_id text UNIQUE,
  razorpay_plan_id text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS razorpay_subscription_id text;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS razorpay_plan_id text;

CREATE TABLE IF NOT EXISTS addon_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  addon text NOT NULL DEFAULT 'storage',
  blocks integer NOT NULL DEFAULT 1,
  razorpay_subscription_id text UNIQUE,
  razorpay_plan_id text,
  status text NOT NULL DEFAULT 'pending',
  current_end timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  razorpay_order_id text UNIQUE,
  razorpay_payment_id text UNIQUE,
  razorpay_subscription_id text,
  plan text,
  kind text NOT NULL DEFAULT 'order',
  amount integer NOT NULL,
  status text NOT NULL,
  invoice_url text,
  coupon_code text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE payments ADD COLUMN IF NOT EXISTS razorpay_subscription_id text;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS plan text;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'order';
ALTER TABLE payments ADD COLUMN IF NOT EXISTS invoice_url text;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS coupon_code text;

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
  idempotency_key text NOT NULL UNIQUE,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS razorpay_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL UNIQUE,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  processing_status text NOT NULL DEFAULT 'processed',
  error text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

CREATE TABLE IF NOT EXISTS contact_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES profiles(id),
  user_id uuid NOT NULL REFERENCES users(id),
  handle text NOT NULL,
  sender_name text NOT NULL,
  sender_email text NOT NULL,
  sender_phone text,
  message text NOT NULL,
  delivery_status text NOT NULL DEFAULT 'pending',
  attempt_count integer NOT NULL DEFAULT 0,
  last_error text,
  ip_hash text,
  read_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE contact_submissions ADD COLUMN IF NOT EXISTS read_at timestamptz;

CREATE TABLE IF NOT EXISTS email_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  recipient text NOT NULL,
  subject text NOT NULL,
  dedupe_key text NOT NULL UNIQUE,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  next_retry_at timestamptz,
  provider_message_id text,
  last_error text,
  user_id uuid REFERENCES users(id),
  related_id text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  sent_at timestamptz
);

CREATE TABLE IF NOT EXISTS lead_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_submission_id uuid NOT NULL REFERENCES contact_submissions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_email text NOT NULL,
  to_name text,
  from_name text,
  reply_to_email text,
  subject text NOT NULL,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  email_delivery_id uuid REFERENCES email_deliveries(id) ON DELETE SET NULL,
  provider_message_id text,
  last_error text,
  created_at timestamptz DEFAULT now(),
  sent_at timestamptz
);

CREATE TABLE IF NOT EXISTS resume_parse_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  status text NOT NULL DEFAULT 'started',
  file_hash text,
  file_name text,
  file_size_bytes integer,
  model text,
  error_message text,
  consumed_quota boolean NOT NULL DEFAULT false,
  during_onboarding boolean NOT NULL DEFAULT true,
  ip_hash text,
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS billing_settings (
  id text PRIMARY KEY DEFAULT 'default',
  currency text NOT NULL DEFAULT 'INR',
  gst_rate real NOT NULL DEFAULT 0.18,
  updated_at timestamptz DEFAULT now()
);

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
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pricing_plans (
  id text PRIMARY KEY,
  display_name text NOT NULL,
  subtitle text,
  price_inr_ex_gst integer NOT NULL DEFAULT 0,
  storage_bytes bigint NOT NULL,
  is_purchasable boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  is_highlighted boolean NOT NULL DEFAULT false,
  features jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  billing_period text NOT NULL DEFAULT 'yearly',
  razorpay_plan_id text,
  parses_per_month integer NOT NULL DEFAULT 0,
  updates_per_month integer NOT NULL DEFAULT 1,
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pricing_coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  description text,
  discount_type text NOT NULL,
  percent_off real,
  inr_off integer,
  plan_prices jsonb,
  allowed_plans jsonb,
  first_customer_only boolean NOT NULL DEFAULT false,
  valid_from timestamptz,
  valid_until timestamptz,
  max_uses integer,
  used_count integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  applies_once boolean NOT NULL DEFAULT true,
  razorpay_offer_id text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE pricing_coupons ADD COLUMN IF NOT EXISTS allowed_plans jsonb;
ALTER TABLE pricing_coupons ADD COLUMN IF NOT EXISTS first_customer_only boolean NOT NULL DEFAULT false;
ALTER TABLE pricing_coupons ADD COLUMN IF NOT EXISTS applies_once boolean NOT NULL DEFAULT true;
ALTER TABLE pricing_coupons ADD COLUMN IF NOT EXISTS razorpay_offer_id text;

CREATE TABLE IF NOT EXISTS coupon_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  coupon_id uuid NOT NULL REFERENCES pricing_coupons(id) ON DELETE CASCADE,
  payment_id uuid REFERENCES payments(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, coupon_id)
);

CREATE TABLE IF NOT EXISTS analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id),
  session_id text,
  event_name text NOT NULL,
  props jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS portfolio_visit_buckets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES profiles(id),
  bucket_start timestamptz NOT NULL,
  path text NOT NULL DEFAULT '/',
  device text NOT NULL DEFAULT 'unknown',
  referrer_host text NOT NULL DEFAULT '',
  view_count integer NOT NULL DEFAULT 0,
  unique_approx integer NOT NULL DEFAULT 0,
  UNIQUE (profile_id, bucket_start, path, device, referrer_host)
);

CREATE TABLE IF NOT EXISTS portfolio_stats_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES profiles(id),
  day date NOT NULL,
  views integer NOT NULL DEFAULT 0,
  uniques_approx integer NOT NULL DEFAULT 0,
  leads integer NOT NULL DEFAULT 0,
  UNIQUE (profile_id, day)
);

-- ========== ADMIN ==========
CREATE TABLE IF NOT EXISTS staff_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  name text,
  phone text,
  password_hash text,
  role text NOT NULL DEFAULT 'support',
  is_active boolean NOT NULL DEFAULT true,
  linked_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  invited_by uuid,
  last_login_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE staff_users ADD COLUMN IF NOT EXISTS phone text;

CREATE TABLE IF NOT EXISTS staff_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  name text,
  phone text,
  role text NOT NULL DEFAULT 'support',
  token_hash text NOT NULL UNIQUE,
  invited_by uuid REFERENCES staff_users(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE staff_invites ADD COLUMN IF NOT EXISTS name text;
ALTER TABLE staff_invites ADD COLUMN IF NOT EXISTS phone text;

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_staff_id uuid REFERENCES staff_users(id) ON DELETE SET NULL,
  action text NOT NULL,
  target_type text,
  target_id text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS support_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type text NOT NULL,
  target_id text NOT NULL,
  author_staff_id uuid REFERENCES staff_users(id) ON DELETE SET NULL,
  body text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number text NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_by_staff_id uuid REFERENCES staff_users(id) ON DELETE SET NULL,
  assignee_staff_id uuid REFERENCES staff_users(id) ON DELETE SET NULL,
  channel text NOT NULL DEFAULT 'phone',
  subject text NOT NULL,
  description text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  priority text NOT NULL DEFAULT 'normal',
  requester_email text,
  requester_phone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  closed_at timestamptz
);

CREATE TABLE IF NOT EXISTS support_ticket_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  actor_staff_id uuid REFERENCES staff_users(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  visibility text NOT NULL DEFAULT 'internal',
  body text,
  from_status text,
  to_status text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ========== INDEXES (scale) ==========
CREATE INDEX IF NOT EXISTS users_created_at_idx ON users (created_at DESC);
CREATE INDEX IF NOT EXISTS users_site_status_idx ON users (site_status);
CREATE INDEX IF NOT EXISTS users_grace_until_idx ON users (grace_until) WHERE grace_until IS NOT NULL;
CREATE INDEX IF NOT EXISTS subscriptions_status_plan_idx ON subscriptions (status, plan);
CREATE INDEX IF NOT EXISTS payments_status_created_idx ON payments (status, created_at DESC);
CREATE INDEX IF NOT EXISTS payments_razorpay_subscription_id_idx ON payments (razorpay_subscription_id) WHERE razorpay_subscription_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS payments_coupon_code_idx ON payments (coupon_code) WHERE coupon_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS staff_invites_email_idx ON staff_invites (lower(email));
CREATE INDEX IF NOT EXISTS admin_audit_log_created_idx ON admin_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_log_actor_idx ON admin_audit_log (actor_staff_id);
CREATE INDEX IF NOT EXISTS support_notes_target_idx ON support_notes (target_type, target_id);
CREATE INDEX IF NOT EXISTS billing_ledger_user_created_idx ON billing_ledger (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS billing_ledger_payment_idx ON billing_ledger (payment_id) WHERE payment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS billing_ledger_event_type_idx ON billing_ledger (event_type);
CREATE INDEX IF NOT EXISTS razorpay_webhook_events_type_idx ON razorpay_webhook_events (event_type, received_at DESC);
CREATE INDEX IF NOT EXISTS coupon_redemptions_user_id_idx ON coupon_redemptions (user_id);
CREATE INDEX IF NOT EXISTS analytics_events_created_idx ON analytics_events (created_at DESC);
CREATE INDEX IF NOT EXISTS analytics_events_name_idx ON analytics_events (event_name, created_at DESC);
CREATE INDEX IF NOT EXISTS email_deliveries_status_retry_idx ON email_deliveries (status, next_retry_at);
CREATE INDEX IF NOT EXISTS support_tickets_user_idx ON support_tickets (user_id);
CREATE INDEX IF NOT EXISTS support_tickets_status_idx ON support_tickets (status);
CREATE INDEX IF NOT EXISTS support_tickets_created_idx ON support_tickets (created_at DESC);
CREATE INDEX IF NOT EXISTS support_tickets_number_idx ON support_tickets (ticket_number);
CREATE INDEX IF NOT EXISTS support_tickets_assignee_idx ON support_tickets (assignee_staff_id);
CREATE INDEX IF NOT EXISTS support_ticket_events_ticket_idx ON support_ticket_events (ticket_id, created_at ASC);

-- ========== SEEDS ==========
INSERT INTO billing_settings (id, currency, gst_rate)
VALUES ('default', 'INR', 0.18)
ON CONFLICT (id) DO NOTHING;

INSERT INTO templates (id, name, description, category, premium, is_active, sort_order, engine, updated_at)
VALUES
  ('minimal', 'Minimal', 'Free path-based portfolio', 'free', false, true, 0, 'spa-minimal', now()),
  ('cura-futuri', 'Cura Futuri', 'Premium editorial portfolio', 'premium', true, true, 10, 'bundle', now()),
  ('sierra-montana', 'Sierra Montana', 'Premium bold portfolio', 'premium', true, true, 20, 'bundle', now()),
  ('nico-palmer', 'Nico Palmer', 'Premium cinematic portfolio', 'premium', true, true, 30, 'bundle', now())
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  category = EXCLUDED.category,
  premium = EXCLUDED.premium,
  is_active = EXCLUDED.is_active,
  sort_order = EXCLUDED.sort_order,
  engine = EXCLUDED.engine,
  updated_at = now();

-- Legacy unused template ids — keep rows but hide from catalog
UPDATE templates
SET is_active = false, category = 'legacy', updated_at = now()
WHERE id IN ('academic', 'creative');

INSERT INTO staff_users (email, name, role, is_active)
VALUES
  ('admin@acedigital.cc', 'Ace Digital Admin', 'super_admin', true),
  ('kavinbalaji365@gmail.com', 'Kavin Balaji', 'super_admin', true)
ON CONFLICT (email) DO NOTHING;
