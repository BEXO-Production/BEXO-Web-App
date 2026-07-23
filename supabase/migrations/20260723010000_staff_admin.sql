-- BEXO Admin staff RBAC + audit + support notes

CREATE TABLE IF NOT EXISTS staff_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  name text,
  password_hash text,
  role text NOT NULL DEFAULT 'support'
    CHECK (role IN ('super_admin', 'support', 'billing', 'ops')),
  is_active boolean NOT NULL DEFAULT true,
  linked_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  invited_by uuid,
  last_login_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS staff_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  role text NOT NULL DEFAULT 'support'
    CHECK (role IN ('super_admin', 'support', 'billing', 'ops')),
  token_hash text NOT NULL UNIQUE,
  invited_by uuid REFERENCES staff_users(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS staff_invites_email_idx ON staff_invites (lower(email));

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_staff_id uuid REFERENCES staff_users(id) ON DELETE SET NULL,
  action text NOT NULL,
  target_type text,
  target_id text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_audit_log_created_idx ON admin_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_log_actor_idx ON admin_audit_log (actor_staff_id);

CREATE TABLE IF NOT EXISTS support_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type text NOT NULL,
  target_id text NOT NULL,
  author_staff_id uuid REFERENCES staff_users(id) ON DELETE SET NULL,
  body text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS support_notes_target_idx ON support_notes (target_type, target_id);

-- Bootstrap super_admin (password set via API bootstrap or invite accept).
-- Email-only seed so login can set password on first invite accept.
INSERT INTO staff_users (email, name, role, is_active)
VALUES ('admin@acedigital.cc', 'Ace Digital Admin', 'super_admin', true)
ON CONFLICT (email) DO NOTHING;

INSERT INTO staff_users (email, name, role, is_active)
VALUES ('kavinbalaji365@gmail.com', 'Kavin Balaji', 'super_admin', true)
ON CONFLICT (email) DO NOTHING;
