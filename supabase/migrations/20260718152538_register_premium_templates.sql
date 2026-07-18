INSERT INTO public.templates (id, name, description)
VALUES
  ('cura-futuri', 'Cura Futuri', 'Modern, high-contrast editorial portfolio with motion and media galleries'),
  ('sierra-montana', 'Sierra Montana', 'Elegant storytelling portfolio with smooth scrolling'),
  ('nico-palmer', 'Nico Palmer', 'Bold cinematic portfolio for creative professionals')
ON CONFLICT (id) DO UPDATE
SET
  name = EXCLUDED.name,
  description = EXCLUDED.description;
