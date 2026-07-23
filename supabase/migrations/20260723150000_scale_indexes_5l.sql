-- Scale indexes for lifecycle email jobs + portfolio lookups at high concurrency.
-- Safe to re-run (IF NOT EXISTS).

CREATE INDEX IF NOT EXISTS users_onboarding_recovery_idx
  ON users (onboarding_completed_at, last_onboarding_activity_at, created_at)
  WHERE onboarding_completed_at IS NULL;

CREATE INDEX IF NOT EXISTS users_email_not_null_idx
  ON users (email)
  WHERE email IS NOT NULL;

CREATE INDEX IF NOT EXISTS profiles_handle_lower_idx
  ON profiles (lower(handle));

CREATE INDEX IF NOT EXISTS profiles_subdomain_lower_idx
  ON profiles (lower(subdomain))
  WHERE subdomain IS NOT NULL;

CREATE INDEX IF NOT EXISTS email_deliveries_pending_idx
  ON email_deliveries (created_at ASC)
  WHERE status IN ('pending', 'failed');

CREATE INDEX IF NOT EXISTS activation_keys_status_idx
  ON activation_keys (status)
  WHERE status = 'unused';

CREATE INDEX IF NOT EXISTS portfolio_visit_buckets_profile_bucket_idx
  ON portfolio_visit_buckets (profile_id, bucket_start DESC);
