-- In-app lead replies (Essential / Growth). Logged + delivered via email outbox.
CREATE TABLE IF NOT EXISTS lead_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_submission_id uuid NOT NULL REFERENCES contact_submissions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_email text NOT NULL,
  to_name text,
  from_name text,
  reply_to_email text,
  subject text NOT NULL,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'queued', -- queued | sent | failed | skipped
  email_delivery_id uuid REFERENCES email_deliveries(id) ON DELETE SET NULL,
  provider_message_id text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);

CREATE INDEX IF NOT EXISTS lead_replies_submission_idx
  ON lead_replies (contact_submission_id, created_at DESC);

CREATE INDEX IF NOT EXISTS lead_replies_user_created_idx
  ON lead_replies (user_id, created_at DESC);
