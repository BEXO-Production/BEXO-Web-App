-- Add auto_connect setting to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS auto_connect BOOLEAN NOT NULL DEFAULT true;
