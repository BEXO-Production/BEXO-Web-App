-- Idempotent catalog seed: plans, coupons, templates, staff, keys, billing_settings.
-- Safe to re-run. Does not delete user data.

-- ========== billing_settings ==========
INSERT INTO billing_settings (id, currency, gst_rate, updated_at)
VALUES ('default', 'INR', 0.18, now())
ON CONFLICT (id) DO UPDATE SET
  currency = EXCLUDED.currency,
  gst_rate = EXCLUDED.gst_rate,
  updated_at = now();

-- ========== pricing_plans (live Razorpay plan ids) ==========
INSERT INTO pricing_plans
  (id, display_name, subtitle, price_inr_ex_gst, storage_bytes, is_purchasable, sort_order, is_highlighted, features, is_active, billing_period, parses_per_month, updates_per_month, razorpay_plan_id, updated_at)
VALUES
  (
    'free', 'Free', 'Basic portfolio to prove the flow',
    0, 10485760, true, 0, false,
    '["Basic template","10MB storage","1 update per month","Path-based link (no subdomain)"]'::jsonb,
    true, 'free', 0, 1, NULL, now()
  ),
  (
    'identity', 'Identity Plan', 'Your professional identity, live',
    59, 52428800, true, 1, false,
    '["yourname subdomain","Premium templates","50MB cloud storage","1 AI resume parse / month","3 updates / month","Monthly invoice in dashboard"]'::jsonb,
    true, 'monthly', 1, 3, 'plan_TGaZShgGee2USr', now()
  ),
  (
    'essential', 'Essential Plan', 'Everything in Identity, more room to grow',
    199, 104857600, true, 2, true,
    '["Everything in Identity","100MB cloud storage","3 AI resume parses / month","10 updates / month","Access to exclusive templates"]'::jsonb,
    true, 'monthly', 3, 10, 'plan_TGaZT3LRfjGLgC', now()
  ),
  (
    'growth', 'Growth Plan', 'Essential, billed yearly',
    999, 104857600, true, 3, false,
    '["Everything in Essential","Billed once a year","100MB cloud storage","3 AI resume parses / month","10 updates / month"]'::jsonb,
    true, 'yearly', 3, 10, 'plan_TGaZTJfF2XLTfh', now()
  ),
  (
    'studentplus', 'Student+ Plan', 'Identity, forever - one payment',
    1999, 52428800, true, 4, false,
    '["Everything in Identity","One-time payment","No renewals ever","50MB cloud storage","1 AI resume parse / month","3 updates / month"]'::jsonb,
    true, 'lifetime', 1, 3, NULL, now()
  ),
  (
    'storage_addon', 'Storage Increase', '+50MB per block, billed monthly',
    25, 52428800, true, 99, false,
    '["+50MB per block on top of your base plan","Billed monthly via Razorpay Autopay","Cancel anytime"]'::jsonb,
    true, 'monthly', 0, 0, 'plan_TGaZTXHFk6pYCx', now()
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
  razorpay_plan_id = COALESCE(EXCLUDED.razorpay_plan_id, pricing_plans.razorpay_plan_id),
  updated_at = now();

-- Keep legacy plan ids present but retired
UPDATE pricing_plans
SET is_active = false, is_purchasable = false, updated_at = now()
WHERE id IN ('annual', 'lifetime');

-- ========== coupons ==========
INSERT INTO pricing_coupons (
  code, description, discount_type, percent_off, inr_off, plan_prices,
  first_customer_only, applies_once, is_active, max_uses, updated_at
)
VALUES
  (
    'BEXODEV',
    'Developer test coupon — ₹1 for first invoice',
    'plan_prices', NULL, NULL,
    '{"identity": 1, "essential": 1, "growth": 1, "studentplus": 1, "storage_addon": 1}'::jsonb,
    false, true, true, NULL, now()
  ),
  (
    'BEXO50',
    '50% off first invoice',
    'percent', 50, NULL, NULL,
    false, true, true, NULL, now()
  ),
  (
    'STUDENT',
    'Student discount ₹200 off',
    'inr_fixed', NULL, 200, NULL,
    true, true, true, NULL, now()
  )
ON CONFLICT (code) DO UPDATE SET
  description = EXCLUDED.description,
  discount_type = EXCLUDED.discount_type,
  percent_off = EXCLUDED.percent_off,
  inr_off = EXCLUDED.inr_off,
  plan_prices = EXCLUDED.plan_prices,
  first_customer_only = EXCLUDED.first_customer_only,
  applies_once = EXCLUDED.applies_once,
  is_active = true,
  updated_at = now();

-- ========== templates ==========
INSERT INTO templates (id, name, description, category, premium, is_active, sort_order, engine, updated_at)
VALUES
  ('minimal', 'Minimal', 'Clean path-based starter portfolio', 'free', false, true, 0, 'spa-minimal', now()),
  ('academic', 'Academic', 'Structured academic-focused layout', 'legacy', false, false, 0, 'bundle', now()),
  ('creative', 'Creative', 'Bold creative portfolio layout', 'legacy', false, false, 0, 'bundle', now()),
  ('cura-futuri', 'Cura Futuri', 'Modern, high-contrast editorial portfolio with motion and media galleries', 'premium', true, true, 10, 'bundle', now()),
  ('sierra-montana', 'Sierra Montana', 'Elegant storytelling portfolio with smooth scrolling', 'premium', true, true, 20, 'bundle', now()),
  ('nico-palmer', 'Nico Palmer', 'Bold cinematic portfolio for creative professionals', 'premium', true, true, 30, 'bundle', now())
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  premium = EXCLUDED.premium,
  is_active = EXCLUDED.is_active,
  sort_order = EXCLUDED.sort_order,
  engine = EXCLUDED.engine,
  updated_at = now();

-- ========== theme variants (defaults if empty) ==========
INSERT INTO theme_variants (template_id, name, tokens)
SELECT v.template_id, v.name, v.tokens::jsonb
FROM (
  VALUES
    ('minimal', 'Default', '{"accent":"blue","bg":"grid"}'),
    ('cura-futuri', 'Default', '{"accent":"editorial","bg":"dark"}'),
    ('sierra-montana', 'Default', '{"accent":"warm","bg":"cream"}'),
    ('nico-palmer', 'Default', '{"accent":"cinematic","bg":"black"}')
) AS v(template_id, name, tokens)
WHERE NOT EXISTS (
  SELECT 1 FROM theme_variants tv WHERE tv.template_id = v.template_id AND tv.name = v.name
);

-- ========== activation keys ==========
INSERT INTO activation_keys (code, status)
VALUES
  ('BEXO-KAVIN-2026', 'unused'),
  ('BEXO-PRO-LIFETIME', 'unused'),
  ('BEXO-TEST-1234', 'unused')
ON CONFLICT (code) DO NOTHING;

-- ========== staff bootstrap ==========
INSERT INTO staff_users (email, name, role, is_active)
VALUES
  ('admin@acedigital.cc', 'Ace Digital Admin', 'super_admin', true),
  ('kavinbalaji365@gmail.com', 'Kavin Balaji', 'super_admin', true)
ON CONFLICT (email) DO UPDATE SET
  name = EXCLUDED.name,
  role = 'super_admin',
  is_active = true,
  updated_at = now();
