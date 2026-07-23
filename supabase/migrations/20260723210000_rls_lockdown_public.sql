-- Production lockdown: enable RLS deny-by-default on all public app tables.
-- The Express API uses DATABASE_URL (table owner / bypasses RLS).
-- Supabase PostgREST (anon / authenticated) must not read or write these tables.
--
-- If you later need client-side PostgREST access, add explicit policies — never
-- leave tables without RLS enabled while the anon key ships in the SPA.

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users',
    'profiles',
    'profile_sections',
    'assets',
    'templates',
    'theme_variants',
    'portfolios',
    'organizations',
    'activation_batches',
    'activation_keys',
    'subscriptions',
    'addon_subscriptions',
    'payments',
    'billing_ledger',
    'razorpay_webhook_events',
    'contact_submissions',
    'email_deliveries',
    'lead_replies',
    'resume_parse_attempts',
    'billing_settings',
    'billing_profiles',
    'pricing_plans',
    'pricing_coupons',
    'coupon_redemptions',
    'analytics_events',
    'portfolio_visit_buckets',
    'portfolio_stats_daily',
    'staff_users',
    'staff_invites',
    'admin_audit_log',
    'support_notes',
    'support_tickets',
    'support_ticket_events'
  ]
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
      -- No policies ⇒ deny all for anon/authenticated. Service role / table owner still OK.
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', t);
    END IF;
  END LOOP;
END $$;

-- Unique Google identity (when linked) — prevents duplicate oauth bindings.
CREATE UNIQUE INDEX IF NOT EXISTS users_oauth_provider_id_uidx
  ON public.users (oauth_provider, oauth_id)
  WHERE oauth_provider IS NOT NULL AND oauth_id IS NOT NULL;
