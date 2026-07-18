-- Platform: contact submissions, email outbox, resume parse attempts, onboarding fields

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS onboarding_successful_parses integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_onboarding_activity_at timestamptz;

CREATE TABLE IF NOT EXISTS contact_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES profiles(id),
  user_id uuid NOT NULL REFERENCES users(id),
  handle text NOT NULL,
  sender_name text NOT NULL,
  sender_email text NOT NULL,
  sender_phone text,
  message text NOT NULL,
  delivery_status text NOT NULL DEFAULT 'pending',
  attempt_count integer NOT NULL DEFAULT 0,
  last_error text,
  ip_hash text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS contact_submissions_user_id_idx ON contact_submissions(user_id);
CREATE INDEX IF NOT EXISTS contact_submissions_handle_created_idx ON contact_submissions(handle, created_at DESC);

CREATE TABLE IF NOT EXISTS email_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  recipient text NOT NULL,
  subject text NOT NULL,
  dedupe_key text NOT NULL UNIQUE,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  next_retry_at timestamptz,
  provider_message_id text,
  last_error text,
  user_id uuid REFERENCES users(id),
  related_id text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  sent_at timestamptz
);

CREATE INDEX IF NOT EXISTS email_deliveries_status_retry_idx ON email_deliveries(status, next_retry_at);
CREATE INDEX IF NOT EXISTS email_deliveries_user_id_idx ON email_deliveries(user_id);

CREATE TABLE IF NOT EXISTS resume_parse_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  status text NOT NULL DEFAULT 'started',
  file_hash text,
  file_name text,
  file_size_bytes integer,
  model text,
  error_message text,
  consumed_quota boolean NOT NULL DEFAULT false,
  during_onboarding boolean NOT NULL DEFAULT true,
  ip_hash text,
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS resume_parse_attempts_user_created_idx ON resume_parse_attempts(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS resume_parse_attempts_user_hash_idx ON resume_parse_attempts(user_id, file_hash);
