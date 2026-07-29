-- A small, validated presentation preference shared by the web and native
-- clients. It is intentionally private: it changes the user's share-card,
-- not the published portfolio itself.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS card_design jsonb NOT NULL
  DEFAULT '{"background":"electric","font":"jakarta"}'::jsonb;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_card_design_shape_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_card_design_shape_check
  CHECK (
    jsonb_typeof(card_design) = 'object'
    AND card_design ? 'background'
    AND card_design ? 'font'
    AND card_design->>'background' IN ('electric', 'ink', 'paper', 'midnight', 'forest', 'clay')
    AND card_design->>'font' IN ('jakarta', 'editorial', 'mono')
  );
