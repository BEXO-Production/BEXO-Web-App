-- Migration: Add BEXODEV developer test coupon for ₹1 first month
INSERT INTO pricing_coupons (
  code,
  description,
  discount_type,
  percent_off,
  inr_off,
  plan_prices,
  valid_from,
  valid_until,
  max_uses,
  is_active
)
VALUES (
  'BEXODEV',
  'Developer test coupon — ₹1 for first month',
  'plan_prices',
  NULL,
  NULL,
  '{"identity": 1, "essential": 1, "growth": 1, "studentplus": 1, "annual": 1, "lifetime": 1, "storage_addon": 1}'::jsonb,
  NULL,
  NULL,
  NULL,
  true
)
ON CONFLICT (code) DO UPDATE SET
  description = EXCLUDED.description,
  discount_type = EXCLUDED.discount_type,
  percent_off = EXCLUDED.percent_off,
  inr_off = EXCLUDED.inr_off,
  plan_prices = EXCLUDED.plan_prices,
  is_active = true,
  updated_at = now();
