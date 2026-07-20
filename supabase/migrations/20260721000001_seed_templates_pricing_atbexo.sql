-- Applied on prod via MCP; kept in repo for reference / re-apply on fresh DBs
INSERT INTO public.templates (id, name, description)
VALUES
  ('minimal', 'Minimal', 'Clean path-based starter portfolio'),
  ('academic', 'Academic', 'Structured academic-focused layout'),
  ('creative', 'Creative', 'Bold creative portfolio layout'),
  ('cura-futuri', 'Cura Futuri', 'Modern, high-contrast editorial portfolio with motion and media galleries'),
  ('sierra-montana', 'Sierra Montana', 'Elegant storytelling portfolio with smooth scrolling'),
  ('nico-palmer', 'Nico Palmer', 'Bold cinematic portfolio for creative professionals')
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name, description = EXCLUDED.description;
