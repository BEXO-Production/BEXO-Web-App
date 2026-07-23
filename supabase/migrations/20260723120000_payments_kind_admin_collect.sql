-- Admin Collect: immediate Payment Link settle + next-cycle Razorpay subscription addons.
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_kind_check;
ALTER TABLE payments
  ADD CONSTRAINT payments_kind_check
  CHECK (kind IN (
    'order',
    'subscription',
    'subscription_bootstrap',
    'addon_increase',
    'admin_collect',
    'admin_collect_next'
  ));
