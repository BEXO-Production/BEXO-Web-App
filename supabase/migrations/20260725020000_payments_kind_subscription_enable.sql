-- Allow 'subscription_enable' payment rows (Autopay re-enable / mandate re-registration).
-- Without this, POST /payments/subscription/enable-autopay fails at the insert and
-- users cannot re-initiate a cancelled Autopay mandate.
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_kind_check;
ALTER TABLE payments
  ADD CONSTRAINT payments_kind_check
  CHECK (kind IN (
    'order',
    'subscription',
    'subscription_bootstrap',
    'subscription_enable',
    'addon_increase',
    'admin_collect',
    'admin_collect_next',
    'activation'
  ));
