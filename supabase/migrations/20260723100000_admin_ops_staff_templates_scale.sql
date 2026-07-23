-- Staff onboarding fields + richer template catalog metadata
ALTER TABLE staff_users
  ADD COLUMN IF NOT EXISTS phone text;

ALTER TABLE staff_invites
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS phone text;

ALTER TABLE templates
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS premium boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS engine text NOT NULL DEFAULT 'bundle',
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

UPDATE templates SET category = 'free', premium = false, engine = 'spa-minimal', sort_order = 0
  WHERE id = 'minimal';
UPDATE templates SET category = 'premium', premium = true, engine = 'bundle', sort_order = 10
  WHERE id = 'cura-futuri';
UPDATE templates SET category = 'premium', premium = true, engine = 'bundle', sort_order = 20
  WHERE id = 'sierra-montana';
UPDATE templates SET category = 'premium', premium = true, engine = 'bundle', sort_order = 30
  WHERE id = 'nico-palmer';

CREATE INDEX IF NOT EXISTS users_created_at_idx ON users (created_at DESC);
CREATE INDEX IF NOT EXISTS users_site_status_idx ON users (site_status);
CREATE INDEX IF NOT EXISTS subscriptions_status_plan_idx ON subscriptions (status, plan);
CREATE INDEX IF NOT EXISTS payments_status_created_idx ON payments (status, created_at DESC);
