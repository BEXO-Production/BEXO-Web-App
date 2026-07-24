-- Staff password reset / forced change support
ALTER TABLE staff_users
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS password_reset_token_hash text,
  ADD COLUMN IF NOT EXISTS password_reset_expires_at timestamptz;

CREATE INDEX IF NOT EXISTS staff_users_password_reset_token_hash_idx
  ON staff_users (password_reset_token_hash)
  WHERE password_reset_token_hash IS NOT NULL;
