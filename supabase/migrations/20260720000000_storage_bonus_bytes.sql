-- Stacked storage add-ons (e.g. yearly plan purchased on top of lifetime)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS storage_bonus_bytes bigint DEFAULT 0;

UPDATE users
SET storage_bonus_bytes = 0
WHERE storage_bonus_bytes IS NULL;
