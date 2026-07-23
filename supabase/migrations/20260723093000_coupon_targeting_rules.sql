-- Coupon targeting rules for Admin-editable promotions
ALTER TABLE pricing_coupons
  ADD COLUMN IF NOT EXISTS allowed_plans jsonb,
  ADD COLUMN IF NOT EXISTS first_customer_only boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN pricing_coupons.allowed_plans IS
  'Null = all purchasable plans. Otherwise array of plan ids e.g. ["identity","essential"].';
COMMENT ON COLUMN pricing_coupons.first_customer_only IS
  'When true, only accounts with no prior successful payment may redeem.';
