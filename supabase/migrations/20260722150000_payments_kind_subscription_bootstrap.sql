-- Allow coupon first-invoice bootstrap orders for Identity/Essential/Growth.
-- When Razorpay Offers API is unavailable, we charge the discounted first
-- invoice as an order (kind=subscription_bootstrap) and schedule Autopay
-- to start at the next billing date.
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_kind_check;
ALTER TABLE payments
  ADD CONSTRAINT payments_kind_check
  CHECK (kind IN ('order', 'subscription', 'subscription_bootstrap', 'addon_increase'));
