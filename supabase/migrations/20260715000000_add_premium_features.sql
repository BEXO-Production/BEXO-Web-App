-- Migration: add_premium_features
-- Description: Adds subdomain routing, premium flag, and tracks template selection for BEXO.

-- We assume the table is named `profiles` or `users`. 
-- Since we do not have the exact table name from the local codebase, we will apply these to `profiles`.
-- Adjust the table name if your Supabase schema uses a different table for users.

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS subdomain text UNIQUE,
ADD COLUMN IF NOT EXISTS template_id text DEFAULT 'minimal',
ADD COLUMN IF NOT EXISTS is_premium boolean DEFAULT false;

-- Add an index on subdomain for fast lookups (since Vercel/Netlify will query by subdomain to fetch the profile)
CREATE INDEX IF NOT EXISTS idx_profiles_subdomain ON public.profiles (subdomain);
