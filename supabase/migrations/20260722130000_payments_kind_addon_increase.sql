-- Allow one-time storage increase payments (merge extra blocks into an active add-on).
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_kind_check;
ALTER TABLE payments
  ADD CONSTRAINT payments_kind_check
  CHECK (kind IN ('order', 'subscription', 'addon_increase'));
