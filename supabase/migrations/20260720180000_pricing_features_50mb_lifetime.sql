-- Align pricing_plans copy + Lifetime 50MB base with product (Jul 2026)

UPDATE pricing_plans SET
  subtitle = 'Publish a path-based portfolio',
  features = '["10MB storage","Path-based portfolio","atbexo.com link"]'::jsonb,
  updated_at = now()
WHERE id = 'free';

UPDATE pricing_plans SET
  subtitle = 'Best for students & professionals',
  features = '["Premium templates","100MB cloud storage base","yourname.atbexo.com","AI resume parses","Renew extends access 1 year"]'::jsonb,
  updated_at = now()
WHERE id = 'annual';

UPDATE pricing_plans SET
  subtitle = 'Best for students & professionals',
  storage_bytes = 52428800,
  features = '["Everything in Yearly (templates & subdomain)","50MB storage base","No renewals for Pro access","Forever hosting"]'::jsonb,
  updated_at = now()
WHERE id = 'lifetime';

-- Recalculate active Lifetime users' quota from new base + existing bonus
UPDATE users u
SET storage_quota_bytes = 52428800 + COALESCE(u.storage_bonus_bytes, 0)
FROM subscriptions s
WHERE s.user_id = u.id
  AND s.plan = 'lifetime'
  AND s.status = 'active';
