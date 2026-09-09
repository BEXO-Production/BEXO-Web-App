-- A short, public, unguessable code that identifies a person's BEXO card.
-- The QR encodes a URL containing this code, so a normal camera app opens the
-- portfolio while the BEXO scanner recognises the identity behind it.
alter table users add column if not exists card_code text;

create or replace function gen_card_code() returns text language sql volatile as $$
  select string_agg(substr('abcdefghjkmnpqrstuvwxyz23456789', (floor(random()*31)+1)::int, 1), '')
  from generate_series(1, 10);
$$;

update users set card_code = gen_card_code() where card_code is null;

alter table users alter column card_code set not null;
create unique index if not exists users_card_code_key on users (card_code);
alter table users alter column card_code set default gen_card_code();

-- Connections between two BEXO users. Stored once per pair: `requester_id`
-- scanned/tapped `addressee_id`'s card. A reverse request auto-accepts, so two
-- people scanning each other never end up with two competing pending rows.
create table if not exists connections (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references users(id) on delete cascade,
  addressee_id uuid not null references users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','declined')),
  source text not null default 'qr' check (source in ('qr','nfc','link','manual')),
  note text,
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint connections_not_self check (requester_id <> addressee_id)
);

-- One row per ordered pair, and one relationship per unordered pair.
create unique index if not exists connections_pair_key on connections (requester_id, addressee_id);
create unique index if not exists connections_unordered_key on connections
  (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
create index if not exists connections_addressee_idx on connections (addressee_id, status);
create index if not exists connections_requester_idx on connections (requester_id, status);

-- Every scan of a card, whether or not it became a connection — this is what
-- the owner sees as "who looked at my card".
create table if not exists card_scans (
  id uuid primary key default gen_random_uuid(),
  card_owner_id uuid not null references users(id) on delete cascade,
  scanner_id uuid references users(id) on delete set null,
  source text not null default 'qr',
  created_at timestamptz not null default now()
);
create index if not exists card_scans_owner_idx on card_scans (card_owner_id, created_at desc);

alter table connections enable row level security;
alter table card_scans enable row level security;
