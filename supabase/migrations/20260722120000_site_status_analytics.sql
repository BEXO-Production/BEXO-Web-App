-- Site pause / grace / cancel-at-period-end + first-party analytics engine

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS site_status text NOT NULL DEFAULT 'live',
  ADD COLUMN IF NOT EXISTS pause_reason text,
  ADD COLUMN IF NOT EXISTS grace_until timestamptz,
  ADD COLUMN IF NOT EXISTS cancel_at_period_end boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS payment_failed_at timestamptz;

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_site_status_check;
ALTER TABLE users
  ADD CONSTRAINT users_site_status_check
  CHECK (site_status IN ('live', 'paused', 'grace'));

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_pause_reason_check;
ALTER TABLE users
  ADD CONSTRAINT users_pause_reason_check
  CHECK (
    pause_reason IS NULL OR pause_reason IN (
      'payment_failed',
      'storage_exceeded',
      'subscription_ended',
      'manual'
    )
  );

CREATE INDEX IF NOT EXISTS users_site_status_idx ON users (site_status);
CREATE INDEX IF NOT EXISTS users_grace_until_idx ON users (grace_until)
  WHERE grace_until IS NOT NULL;

-- Contact leads: owner inbox read state
ALTER TABLE contact_submissions
  ADD COLUMN IF NOT EXISTS read_at timestamptz;

-- Internal web-app product events (BEXO ops; not shown to portfolio owners)
CREATE TABLE IF NOT EXISTS analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id),
  session_id text,
  event_name text NOT NULL,
  props jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS analytics_events_created_at_idx ON analytics_events (created_at);
CREATE INDEX IF NOT EXISTS analytics_events_user_name_idx ON analytics_events (user_id, event_name);

-- High-write portfolio visit counters (hourly buckets)
CREATE TABLE IF NOT EXISTS portfolio_visit_buckets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  bucket_start timestamptz NOT NULL,
  path text NOT NULL DEFAULT '/',
  device text NOT NULL DEFAULT 'unknown',
  referrer_host text NOT NULL DEFAULT '',
  view_count integer NOT NULL DEFAULT 0,
  unique_approx integer NOT NULL DEFAULT 0,
  CONSTRAINT portfolio_visit_buckets_uniq
    UNIQUE (profile_id, bucket_start, path, device, referrer_host)
);

CREATE INDEX IF NOT EXISTS portfolio_visit_buckets_profile_bucket_idx
  ON portfolio_visit_buckets (profile_id, bucket_start);

-- Daily rollups for owner dashboards
CREATE TABLE IF NOT EXISTS portfolio_stats_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  day date NOT NULL,
  views integer NOT NULL DEFAULT 0,
  uniques_approx integer NOT NULL DEFAULT 0,
  leads integer NOT NULL DEFAULT 0,
  top_referrers jsonb NOT NULL DEFAULT '[]'::jsonb,
  devices jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT portfolio_stats_daily_uniq UNIQUE (profile_id, day)
);

CREATE INDEX IF NOT EXISTS portfolio_stats_daily_profile_day_idx
  ON portfolio_stats_daily (profile_id, day DESC);
