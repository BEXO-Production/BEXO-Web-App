-- New 6-tier plan catalog + resume manager + assets groundwork
-- 1. pricing_plans: billing period, razorpay plan id, per-plan parse/update limits; new plan rows
-- 2. subscriptions: migrate legacy plan ids (annual->growth, lifetime->studentplus)
-- 3. addon_subscriptions: monthly storage add-on (second concurrent Razorpay subscription)
-- 4. users: generated resume URL + default-resume preference + monthly update counters
-- 5. assets: ensure table exists and backfill rows from profile_sections JSON
-- 6. payments: widen plan check to new ids

-- ---------------------------------------------------------------------------
-- 1. Pricing catalog
-- ---------------------------------------------------------------------------
ALTER TABLE pricing_plans
  ADD COLUMN IF NOT EXISTS billing_period text NOT NULL DEFAULT 'yearly',
  ADD COLUMN IF NOT EXISTS razorpay_plan_id text,
  ADD COLUMN IF NOT EXISTS parses_per_month integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updates_per_month integer NOT NULL DEFAULT 1;

INSERT INTO pricing_plans
  (id, display_name, subtitle, price_inr_ex_gst, storage_bytes, is_purchasable, sort_order, is_highlighted, features, is_active, billing_period, parses_per_month, updates_per_month)
VALUES
  (
    'free', 'Free', 'Basic portfolio to prove the flow',
    0, 10485760, true, 0, false,
    '["Basic template","10MB storage","1 update per month","Path-based link (no subdomain)"]'::jsonb,
    true, 'free', 0, 1
  ),
  (
    'identity', 'Identity Plan', 'Your professional identity, live',
    59, 52428800, true, 1, false,
    '["yourname subdomain","Premium templates","50MB cloud storage","1 AI resume parse / month","3 updates / month","Monthly invoice in dashboard"]'::jsonb,
    true, 'monthly', 1, 3
  ),
  (
    'essential', 'Essential Plan', 'Everything in Identity, more room to grow',
    199, 104857600, true, 2, true,
    '["Everything in Identity","100MB cloud storage","3 AI resume parses / month","10 updates / month","Access to exclusive templates"]'::jsonb,
    true, 'monthly', 3, 10
  ),
  (
    'growth', 'Growth Plan', 'Essential, billed yearly',
    999, 104857600, true, 3, false,
    '["Everything in Essential","Billed once a year","100MB cloud storage","3 AI resume parses / month","10 updates / month"]'::jsonb,
    true, 'yearly', 3, 10
  ),
  (
    'studentplus', 'Student+ Plan', 'Identity, forever - one payment',
    1999, 52428800, true, 4, false,
    '["Everything in Identity","One-time payment","No renewals ever","50MB cloud storage","1 AI resume parse / month","3 updates / month"]'::jsonb,
    true, 'lifetime', 1, 3
  ),
  (
    'storage_addon', 'Storage Increase', '+50MB per block, billed monthly',
    25, 52428800, true, 99, false,
    '["+50MB per block on top of your base plan","Billed monthly via Razorpay Autopay","Cancel anytime"]'::jsonb,
    true, 'monthly', 0, 0
  )
ON CONFLICT (id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  subtitle = EXCLUDED.subtitle,
  price_inr_ex_gst = EXCLUDED.price_inr_ex_gst,
  storage_bytes = EXCLUDED.storage_bytes,
  is_purchasable = EXCLUDED.is_purchasable,
  sort_order = EXCLUDED.sort_order,
  is_highlighted = EXCLUDED.is_highlighted,
  features = EXCLUDED.features,
  is_active = EXCLUDED.is_active,
  billing_period = EXCLUDED.billing_period,
  parses_per_month = EXCLUDED.parses_per_month,
  updates_per_month = EXCLUDED.updates_per_month,
  updated_at = now();

-- Razorpay plan ids (test mode; swap when going live)
UPDATE pricing_plans SET razorpay_plan_id = 'plan_TG5sccGNDClMmo', updated_at = now() WHERE id = 'identity';
UPDATE pricing_plans SET razorpay_plan_id = 'plan_TG5sd0bp8lk8LH', updated_at = now() WHERE id = 'essential';
UPDATE pricing_plans SET razorpay_plan_id = 'plan_TG5sdCcFb3Kz8T', updated_at = now() WHERE id = 'growth';
UPDATE pricing_plans SET razorpay_plan_id = 'plan_TG5sdNqyXhFgtM', updated_at = now() WHERE id = 'storage_addon';

-- Retire the old catalog + its promo coupons
UPDATE pricing_plans
SET is_active = false, is_purchasable = false, updated_at = now()
WHERE id IN ('annual', 'lifetime');

UPDATE pricing_coupons
SET is_active = false, updated_at = now()
WHERE upper(code) IN ('EARLYBIRD', 'BEXO2026', 'PROMO2026');

-- ---------------------------------------------------------------------------
-- 2. Migrate existing subscriptions to the new plan ids
-- ---------------------------------------------------------------------------
UPDATE subscriptions SET plan = 'growth' WHERE plan = 'annual';
UPDATE subscriptions SET plan = 'studentplus' WHERE plan = 'lifetime';

-- ---------------------------------------------------------------------------
-- 3. Storage add-on subscriptions (separate from the base plan row)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS addon_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  addon text NOT NULL DEFAULT 'storage',
  blocks integer NOT NULL DEFAULT 1,
  razorpay_subscription_id text,
  razorpay_plan_id text,
  status text NOT NULL DEFAULT 'pending',
  current_end timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS addon_subscriptions_rzp_sub_unique
  ON addon_subscriptions (razorpay_subscription_id)
  WHERE razorpay_subscription_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS addon_subscriptions_user_idx ON addon_subscriptions (user_id);

-- ---------------------------------------------------------------------------
-- 4. Users: resume manager + update counters
-- ---------------------------------------------------------------------------
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS generated_resume_url text,
  ADD COLUMN IF NOT EXISTS default_resume text NOT NULL DEFAULT 'generated',
  ADD COLUMN IF NOT EXISTS updates_this_month integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_updates_reset timestamptz DEFAULT now();

-- Backfill: URLs matching the generated-file naming convention are system resumes;
-- anything else in resume_url is a user upload (uploads won today, keep that behavior).
UPDATE users
SET generated_resume_url = resume_url,
    resume_url = NULL,
    default_resume = 'generated'
WHERE resume_url LIKE '%\_resume.pdf%' ESCAPE '\';

UPDATE users
SET default_resume = 'uploaded'
WHERE resume_url IS NOT NULL AND default_resume = 'generated';

-- ---------------------------------------------------------------------------
-- 5. Assets table (was dead code) + backfill from profile_sections JSON
-- ---------------------------------------------------------------------------
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

CREATE INDEX IF NOT EXISTS assets_user_idx ON assets (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS assets_user_url_unique ON assets (user_id, url);

INSERT INTO assets (user_id, name, url, size_bytes, section_type, entry_id)
SELECT
  p.user_id,
  coalesce(x.a->>'name', 'file'),
  x.a->>'url',
  coalesce(nullif(x.a->>'sizeBytes', '')::bigint, 0)::integer,
  ps.type,
  e.entry->>'id'
FROM profile_sections ps
JOIN profiles p ON p.id = ps.profile_id
CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(ps.entries) = 'array' THEN ps.entries ELSE '[]'::jsonb END
) AS e(entry)
CROSS JOIN LATERAL (
  SELECT jsonb_array_elements(
    CASE WHEN jsonb_typeof(e.entry->'assets'->'images') = 'array' THEN e.entry->'assets'->'images' ELSE '[]'::jsonb END
  ) AS a
  UNION ALL
  SELECT jsonb_array_elements(
    CASE WHEN jsonb_typeof(e.entry->'assets'->'pdfs') = 'array' THEN e.entry->'assets'->'pdfs' ELSE '[]'::jsonb END
  )
) AS x(a)
WHERE (x.a->>'url') LIKE 'http%'
ON CONFLICT (user_id, url) DO NOTHING;

-- Uploaded resumes count as assets too
INSERT INTO assets (user_id, name, url, size_bytes, section_type, entry_id)
SELECT id, 'Uploaded resume', resume_url, 0, 'resume', NULL
FROM users
WHERE resume_url IS NOT NULL AND resume_url LIKE 'http%'
ON CONFLICT (user_id, url) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 6. Payments: allow the new plan ids
-- ---------------------------------------------------------------------------
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_plan_check;
ALTER TABLE payments ADD CONSTRAINT payments_plan_check CHECK (
  plan IS NULL OR plan IN ('annual', 'lifetime', 'identity', 'essential', 'growth', 'studentplus', 'storage_addon')
);
