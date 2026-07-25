-- Brings the production database (nyyfcwblrnjnvhiynryb) to full parity with the
-- development database (qovrjyfhtaytaiwjbiqu). Idempotent and safe to re-run.

BEGIN;

-- 1. Columns present in dev but absent in prod
ALTER TABLE public.portfolio_stats_daily
  ADD COLUMN IF NOT EXISTS devices jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS top_referrers jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 2. Numeric precision drift: prod created these as real (float4)
ALTER TABLE public.billing_settings
  ALTER COLUMN gst_rate TYPE numeric USING gst_rate::numeric;
ALTER TABLE public.pricing_coupons
  ALTER COLUMN percent_off TYPE numeric USING percent_off::numeric;

-- 3. Timestamp columns missing DEFAULT now() / NOT NULL in prod
UPDATE public.analytics_events   SET created_at = now() WHERE created_at IS NULL;
UPDATE public.billing_profiles   SET created_at = now() WHERE created_at IS NULL;
UPDATE public.billing_profiles   SET updated_at = now() WHERE updated_at IS NULL;
UPDATE public.billing_settings   SET updated_at = now() WHERE updated_at IS NULL;
UPDATE public.coupon_redemptions SET created_at = now() WHERE created_at IS NULL;
UPDATE public.lead_replies       SET created_at = now() WHERE created_at IS NULL;
UPDATE public.pricing_coupons    SET created_at = now() WHERE created_at IS NULL;
UPDATE public.pricing_coupons    SET updated_at = now() WHERE updated_at IS NULL;
UPDATE public.pricing_plans      SET updated_at = now() WHERE updated_at IS NULL;

ALTER TABLE public.analytics_events   ALTER COLUMN created_at SET DEFAULT now(), ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE public.billing_profiles   ALTER COLUMN created_at SET DEFAULT now(), ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE public.billing_profiles   ALTER COLUMN updated_at SET DEFAULT now(), ALTER COLUMN updated_at SET NOT NULL;
ALTER TABLE public.billing_settings   ALTER COLUMN updated_at SET DEFAULT now(), ALTER COLUMN updated_at SET NOT NULL;
ALTER TABLE public.coupon_redemptions ALTER COLUMN created_at SET DEFAULT now(), ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE public.lead_replies       ALTER COLUMN created_at SET DEFAULT now(), ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE public.pricing_coupons    ALTER COLUMN created_at SET DEFAULT now(), ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE public.pricing_coupons    ALTER COLUMN updated_at SET DEFAULT now(), ALTER COLUMN updated_at SET NOT NULL;
ALTER TABLE public.pricing_plans      ALTER COLUMN updated_at SET DEFAULT now(), ALTER COLUMN updated_at SET NOT NULL;

-- 4. CHECK constraints that guard enum-like text columns
DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT * FROM (VALUES
      ('pricing_coupons',       'pricing_coupons_discount_type_check',        $q$CHECK (discount_type = ANY (ARRAY['percent'::text, 'inr_fixed'::text, 'plan_prices'::text]))$q$),
      ('staff_invites',         'staff_invites_role_check',                   $q$CHECK (role = ANY (ARRAY['super_admin'::text, 'support'::text, 'billing'::text, 'ops'::text]))$q$),
      ('staff_users',           'staff_users_role_check',                     $q$CHECK (role = ANY (ARRAY['super_admin'::text, 'support'::text, 'billing'::text, 'ops'::text]))$q$),
      ('support_ticket_events', 'support_ticket_events_event_type_check',     $q$CHECK (event_type = ANY (ARRAY['created'::text, 'status_change'::text, 'note'::text, 'reply'::text, 'assignment'::text]))$q$),
      ('support_ticket_events', 'support_ticket_events_visibility_check',     $q$CHECK (visibility = ANY (ARRAY['internal'::text, 'customer'::text]))$q$),
      ('support_tickets',       'support_tickets_priority_check',             $q$CHECK (priority = ANY (ARRAY['low'::text, 'normal'::text, 'high'::text]))$q$),
      ('support_tickets',       'support_tickets_status_check',               $q$CHECK (status = ANY (ARRAY['open'::text, 'in_progress'::text, 'resolved'::text, 'closed'::text]))$q$),
      ('users',                 'users_pause_reason_check',                   $q$CHECK (pause_reason IS NULL OR pause_reason = ANY (ARRAY['payment_failed'::text, 'storage_exceeded'::text, 'subscription_ended'::text, 'manual'::text]))$q$),
      ('users',                 'users_site_status_check',                    $q$CHECK (site_status = ANY (ARRAY['live'::text, 'paused'::text, 'grace'::text]))$q$)
    ) AS t(tbl, name, def)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE connamespace = 'public'::regnamespace AND conname = c.name
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I %s', c.tbl, c.name, c.def);
    END IF;
  END LOOP;
END $$;

-- 5. Query indexes missing in prod
CREATE INDEX IF NOT EXISTS analytics_events_created_at_idx        ON public.analytics_events (created_at);
CREATE INDEX IF NOT EXISTS analytics_events_user_name_idx         ON public.analytics_events (user_id, event_name);
CREATE INDEX IF NOT EXISTS billing_profiles_email_idx             ON public.billing_profiles (lower(email));
CREATE INDEX IF NOT EXISTS billing_profiles_updated_idx           ON public.billing_profiles (updated_at DESC);
CREATE INDEX IF NOT EXISTS lead_replies_submission_idx            ON public.lead_replies (contact_submission_id, created_at DESC);
CREATE INDEX IF NOT EXISTS lead_replies_user_created_idx          ON public.lead_replies (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS portfolio_stats_daily_profile_day_idx  ON public.portfolio_stats_daily (profile_id, day DESC);

-- 6. Align unique-constraint names with the Drizzle schema so drizzle-kit and any
--    ON CONFLICT ON CONSTRAINT clause resolve identically in both environments.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('billing_ledger_idempotency_key_key',                             'billing_ledger_idempotency_key_unique'),
      ('email_deliveries_dedupe_key_unique',                             'email_deliveries_dedupe_key_key'),
      ('portfolio_stats_daily_profile_id_day_key',                       'portfolio_stats_daily_uniq'),
      ('portfolio_visit_buckets_profile_id_bucket_start_path_device_key', 'portfolio_visit_buckets_uniq'),
      ('profiles_subdomain_unique',                                      'profiles_subdomain_key'),
      ('razorpay_webhook_events_event_id_key',                           'razorpay_webhook_events_event_id_unique')
    ) AS t(old_name, new_name)
  LOOP
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE connamespace='public'::regnamespace AND conname = r.old_name)
       AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE connamespace='public'::regnamespace AND conname = r.new_name) THEN
      EXECUTE format(
        'ALTER TABLE public.%I RENAME CONSTRAINT %I TO %I',
        (SELECT conrelid::regclass::text FROM pg_constraint WHERE connamespace='public'::regnamespace AND conname = r.old_name),
        r.old_name, r.new_name
      );
    END IF;
  END LOOP;
END $$;

COMMIT;
