-- First-invoice coupons: store Razorpay offer ids, per-user redemption, audit on payments.
ALTER TABLE pricing_coupons
  ADD COLUMN IF NOT EXISTS applies_once boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS razorpay_offer_id text;

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS coupon_code text;

CREATE TABLE IF NOT EXISTS coupon_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  coupon_id uuid NOT NULL REFERENCES pricing_coupons(id) ON DELETE CASCADE,
  payment_id uuid REFERENCES payments(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, coupon_id)
);

CREATE INDEX IF NOT EXISTS coupon_redemptions_user_id_idx ON coupon_redemptions (user_id);
CREATE INDEX IF NOT EXISTS payments_coupon_code_idx ON payments (coupon_code)
  WHERE coupon_code IS NOT NULL;
