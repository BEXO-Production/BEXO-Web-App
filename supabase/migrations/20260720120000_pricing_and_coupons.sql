-- BEXO pricing catalog + coupons (managed in Supabase, consumed by API)

CREATE TABLE IF NOT EXISTS billing_settings (
  id text PRIMARY KEY DEFAULT 'default',
  currency text NOT NULL DEFAULT 'INR',
  gst_rate numeric(5, 4) NOT NULL DEFAULT 0.18,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO billing_settings (id, currency, gst_rate)
VALUES ('default', 'INR', 0.18)
ON CONFLICT (id) DO NOTHING;

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
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO pricing_plans (id, display_name, subtitle, price_inr_ex_gst, storage_bytes, is_purchasable, sort_order, is_highlighted, features)
VALUES
  (
    'free',
    'Free',
    'Publish a path-based portfolio',
    0,
    10485760,
    true,
    0,
    false,
    '["10MB storage","Path-based portfolio","atbexo.com link"]'::jsonb
  ),
  (
    'annual',
    'Yearly',
    'Best for students & professionals',
    1499,
    104857600,
    true,
    1,
    true,
    '["Premium templates","100MB cloud storage base","yourname.atbexo.com","AI resume parses","Renew extends access 1 year"]'::jsonb
  ),
  (
    'lifetime',
    'Lifetime',
    'Best for students & professionals',
    2999,
    52428800,
    true,
    2,
    false,
    '["Everything in Yearly (templates & subdomain)","50MB storage base","No renewals for Pro access","Forever hosting"]'::jsonb
  )
ON CONFLICT (id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  subtitle = EXCLUDED.subtitle,
  price_inr_ex_gst = EXCLUDED.price_inr_ex_gst,
  storage_bytes = EXCLUDED.storage_bytes,
  features = EXCLUDED.features,
  updated_at = now();

CREATE TABLE IF NOT EXISTS pricing_coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  description text,
  discount_type text NOT NULL CHECK (discount_type IN ('percent', 'inr_fixed', 'plan_prices')),
  percent_off numeric(6, 2),
  inr_off integer,
  plan_prices jsonb,
  valid_from timestamptz,
  valid_until timestamptz,
  max_uses integer,
  used_count integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pricing_coupons_code_unique UNIQUE (code)
);

CREATE INDEX IF NOT EXISTS pricing_coupons_code_active_idx ON pricing_coupons (upper(code)) WHERE is_active = true;

INSERT INTO pricing_coupons (code, description, discount_type, percent_off, inr_off, plan_prices, valid_from, valid_until, max_uses, is_active)
VALUES
  (
    'BEXO50',
    '50% off any paid plan',
    'percent',
    50,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    true
  ),
  (
    'STUDENT',
    '₹200 off',
    'inr_fixed',
    NULL,
    200,
    NULL,
    NULL,
    NULL,
    NULL,
    true
  ),
  (
    'BEXO2026',
    'Launch promo pricing',
    'plan_prices',
    NULL,
    NULL,
    '{"annual": 999, "lifetime": 1999}'::jsonb,
    NULL,
    '2026-12-31 23:59:59+00',
    NULL,
    true
  ),
  (
    'PROMO2026',
    'Alias for BEXO2026',
    'plan_prices',
    NULL,
    NULL,
    '{"annual": 999, "lifetime": 1999}'::jsonb,
    NULL,
    '2026-12-31 23:59:59+00',
    NULL,
    true
  )
ON CONFLICT (code) DO UPDATE SET
  description = EXCLUDED.description,
  discount_type = EXCLUDED.discount_type,
  percent_off = EXCLUDED.percent_off,
  inr_off = EXCLUDED.inr_off,
  plan_prices = EXCLUDED.plan_prices,
  valid_until = EXCLUDED.valid_until,
  is_active = EXCLUDED.is_active,
  updated_at = now();
