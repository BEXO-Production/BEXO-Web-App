-- Marketing Contact Us → CRM leads in BEXO Admin.
CREATE TABLE IF NOT EXISTS marketing_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL,
  phone text,
  subject text,
  message text NOT NULL,
  source text NOT NULL DEFAULT 'marketing_contact',
  page_url text,
  status text NOT NULL DEFAULT 'new',
  ip_hash text,
  notes text,
  assigned_staff_id uuid REFERENCES staff_users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS marketing_leads_created_idx ON marketing_leads (created_at DESC);
CREATE INDEX IF NOT EXISTS marketing_leads_status_idx ON marketing_leads (status, created_at DESC);
CREATE INDEX IF NOT EXISTS marketing_leads_email_idx ON marketing_leads (email);

ALTER TABLE marketing_leads ENABLE ROW LEVEL SECURITY;
