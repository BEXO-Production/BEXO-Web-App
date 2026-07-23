-- Activation code engine: organizations, batches, enriched keys, payments.kind=activation

CREATE TABLE IF NOT EXISTS organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  email_domains jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS activation_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  label text NOT NULL,
  default_plan text NOT NULL DEFAULT 'essential',
  binding_mode text NOT NULL DEFAULT 'email_linked',
  status text NOT NULL DEFAULT 'pending',
  total_rows integer NOT NULL DEFAULT 0,
  created_count integer NOT NULL DEFAULT 0,
  emailed_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  redeemed_count integer NOT NULL DEFAULT 0,
  expires_at timestamptz,
  created_by_staff_id uuid,
  error_summary text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

ALTER TABLE activation_keys ADD COLUMN IF NOT EXISTS plan text NOT NULL DEFAULT 'essential';
ALTER TABLE activation_keys ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL;
ALTER TABLE activation_keys ADD COLUMN IF NOT EXISTS batch_id uuid REFERENCES activation_batches(id) ON DELETE SET NULL;
ALTER TABLE activation_keys ADD COLUMN IF NOT EXISTS bound_email text;
ALTER TABLE activation_keys ADD COLUMN IF NOT EXISTS recipient_name text;
ALTER TABLE activation_keys ADD COLUMN IF NOT EXISTS expires_at timestamptz;
ALTER TABLE activation_keys ADD COLUMN IF NOT EXISTS email_delivery_id uuid;
ALTER TABLE activation_keys ADD COLUMN IF NOT EXISTS emailed_at timestamptz;
ALTER TABLE activation_keys ADD COLUMN IF NOT EXISTS created_by_staff_id uuid;
ALTER TABLE activation_keys ADD COLUMN IF NOT EXISTS notes text;

CREATE INDEX IF NOT EXISTS activation_keys_org_status_idx
  ON activation_keys (organization_id, status);
CREATE INDEX IF NOT EXISTS activation_keys_batch_idx
  ON activation_keys (batch_id);
CREATE INDEX IF NOT EXISTS activation_keys_bound_email_idx
  ON activation_keys (lower(bound_email))
  WHERE bound_email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS activation_keys_batch_email_unused_uniq
  ON activation_keys (batch_id, lower(bound_email))
  WHERE bound_email IS NOT NULL AND status = 'unused' AND batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS activation_batches_org_idx
  ON activation_batches (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS organizations_slug_idx ON organizations (slug);

INSERT INTO organizations (name, slug, email_domains, notes)
VALUES
  ('PSG College of Technology', 'PSG', '["psgtech.ac.in"]'::jsonb, 'Seed campus partner'),
  ('Dr. N.G.P. Institute of Technology', 'NGP', '[]'::jsonb, 'Seed campus partner'),
  ('BEXO Direct / General', 'BEXO', '[]'::jsonb, 'Default prefix for non-campus codes')
ON CONFLICT (slug) DO NOTHING;

-- Allow activation payment kind
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_kind_check;
ALTER TABLE payments
  ADD CONSTRAINT payments_kind_check
  CHECK (kind IN (
    'order',
    'subscription',
    'subscription_bootstrap',
    'addon_increase',
    'admin_collect',
    'admin_collect_next',
    'activation'
  ));
