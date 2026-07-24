-- Persist pronouns / nationality for dashboard Settings + Edit Profile
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pronouns text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS nationality text;
