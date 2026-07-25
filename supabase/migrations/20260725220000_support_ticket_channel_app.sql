-- Allow in-app support tickets.
-- The dashboard "Contact support" form submits channel = 'app', but the original
-- support_tickets CHECK only permitted phone/email/other, so every in-app ticket
-- insert failed with a constraint violation ("Could not create ticket").

ALTER TABLE support_tickets
  DROP CONSTRAINT IF EXISTS support_tickets_channel_check;

ALTER TABLE support_tickets
  ADD CONSTRAINT support_tickets_channel_check
  CHECK (channel IN ('phone', 'email', 'other', 'app'));
