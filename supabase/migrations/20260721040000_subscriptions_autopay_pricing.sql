-- Razorpay autopay (yearly subscriptions) + lifetime one-time orders
-- 1. Track Razorpay subscription ids on subscriptions + payments
-- 2. Persist plan/kind on payments (webhooks read plan from DB, not notes)
-- 3. Reprice: Yearly ₹799 ex-GST, Lifetime ₹1999 ex-GST
-- 4. Seed EARLYBIRD coupon locking those prices explicitly

-- 1. Subscriptions: link to Razorpay subscription + plan
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS razorpay_subscription_id text,
  ADD COLUMN IF NOT EXISTS razorpay_plan_id text;

CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_razorpay_subscription_id_unique
  ON subscriptions (razorpay_subscription_id)
  WHERE razorpay_subscription_id IS NOT NULL;

-- 2. Payments: plan + kind + subscription linkage.
--    Subscription-kind payments have no order id at creation time.
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS plan text CHECK (plan IN ('annual', 'lifetime') OR plan IS NULL),
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'order' CHECK (kind IN ('order', 'subscription')),
  ADD COLUMN IF NOT EXISTS razorpay_subscription_id text;

ALTER TABLE payments ALTER COLUMN razorpay_order_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS payments_razorpay_subscription_id_idx
  ON payments (razorpay_subscription_id)
  WHERE razorpay_subscription_id IS NOT NULL;

-- 3. Reprice list plans (ex-GST)
UPDATE pricing_plans
SET price_inr_ex_gst = 799,
    features = '["Premium templates","100MB cloud storage base","yourname.atbexo.com","AI resume parses","Auto-renews yearly via Razorpay Autopay"]'::jsonb,
    updated_at = now()
WHERE id = 'annual';

UPDATE pricing_plans
SET price_inr_ex_gst = 1999,
    features = '["Everything in Yearly (templates & subdomain)","50MB storage base","One-time payment — no renewals","Forever hosting"]'::jsonb,
    updated_at = now()
WHERE id = 'lifetime';

-- 4. EARLYBIRD coupon: explicit promo at the same locked prices
INSERT INTO pricing_coupons (code, description, discount_type, percent_off, inr_off, plan_prices, valid_from, valid_until, max_uses, is_active)
VALUES (
  'EARLYBIRD',
  'Early bird pricing — Yearly ₹799, Lifetime ₹1999 (+GST)',
  'plan_prices',
  NULL,
  NULL,
  '{"annual": 799, "lifetime": 1999}'::jsonb,
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
  valid_until = EXCLUDED.valid_until,
  is_active = EXCLUDED.is_active,
  updated_at = now();
