-- Async resume parsing queue.
-- The upload request now only enqueues work; a worker drains the queue so a
-- traffic spike queues in Postgres instead of opening thousands of parallel
-- AI calls (and so a slow provider cannot hold an HTTP thread open).

ALTER TABLE resume_parse_attempts ADD COLUMN IF NOT EXISTS resume_text text;
ALTER TABLE resume_parse_attempts ADD COLUMN IF NOT EXISTS resume_url text;
ALTER TABLE resume_parse_attempts ADD COLUMN IF NOT EXISTS error_code text;
ALTER TABLE resume_parse_attempts ADD COLUMN IF NOT EXISTS result jsonb;
ALTER TABLE resume_parse_attempts ADD COLUMN IF NOT EXISTS claimed_at timestamptz;
ALTER TABLE resume_parse_attempts ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0;

-- Worker claim path: oldest queued job first.
CREATE INDEX IF NOT EXISTS resume_parse_attempts_queue_idx
  ON resume_parse_attempts(status, created_at)
  WHERE status IN ('queued', 'processing');

-- Cooldown lookups after a total provider outage.
CREATE INDEX IF NOT EXISTS resume_parse_attempts_user_status_created_idx
  ON resume_parse_attempts(user_id, status, created_at DESC);

-- Legacy rows were left in 'started' by the old synchronous handler; they are
-- not claimable work and would otherwise block the one-in-flight-per-user gate.
-- 'abandoned_legacy' is deliberately not 'provider_outage': these rows must not
-- put existing users into a 10-minute cooldown on their next upload.
UPDATE resume_parse_attempts
SET status = 'failed',
    error_code = COALESCE(error_code, 'abandoned_legacy'),
    completed_at = COALESCE(completed_at, now())
WHERE status = 'started';
