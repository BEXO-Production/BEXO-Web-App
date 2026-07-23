-- Staff support ticketing (BEXO Admin Support module)

CREATE TABLE IF NOT EXISTS support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number text NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_by_staff_id uuid REFERENCES staff_users(id) ON DELETE SET NULL,
  assignee_staff_id uuid REFERENCES staff_users(id) ON DELETE SET NULL,
  channel text NOT NULL DEFAULT 'phone'
    CHECK (channel IN ('phone', 'email', 'other')),
  subject text NOT NULL,
  description text NOT NULL,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  priority text NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high')),
  requester_email text,
  requester_phone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  closed_at timestamptz
);

CREATE INDEX IF NOT EXISTS support_tickets_user_idx ON support_tickets (user_id);
CREATE INDEX IF NOT EXISTS support_tickets_status_idx ON support_tickets (status);
CREATE INDEX IF NOT EXISTS support_tickets_created_idx ON support_tickets (created_at DESC);
CREATE INDEX IF NOT EXISTS support_tickets_number_idx ON support_tickets (ticket_number);
CREATE INDEX IF NOT EXISTS support_tickets_assignee_idx ON support_tickets (assignee_staff_id);

CREATE TABLE IF NOT EXISTS support_ticket_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  actor_staff_id uuid REFERENCES staff_users(id) ON DELETE SET NULL,
  event_type text NOT NULL
    CHECK (event_type IN ('created', 'status_change', 'note', 'reply', 'assignment')),
  visibility text NOT NULL DEFAULT 'internal'
    CHECK (visibility IN ('internal', 'customer')),
  body text,
  from_status text,
  to_status text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS support_ticket_events_ticket_idx
  ON support_ticket_events (ticket_id, created_at ASC);

ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_ticket_events ENABLE ROW LEVEL SECURITY;
