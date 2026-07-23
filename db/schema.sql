-- Secret Share schema.
-- Run once against your database:  psql "$DATABASE_URL" -f db/schema.sql

-- gen_random_uuid() is core since Postgres 13, so no pgcrypto extension (and no
-- superuser grant to install one) is needed.

-- A secret is stored ONLY as ciphertext. The decryption key lives in the URL
-- fragment and is never transmitted to this server, so these rows are inert
-- without the link.
create table if not exists secrets (
  id             uuid primary key default gen_random_uuid(),
  label          text not null default '',
  ciphertext     text not null,           -- base64url AES-256-GCM ciphertext+tag
  iv             text not null,           -- base64url 12-byte nonce
  allowed_emails text[] not null,         -- normalized lowercase
  created_by     text not null,
  created_at     timestamptz not null default now(),
  expires_at     timestamptz not null,
  viewed_at      timestamptz,             -- non-null == burned
  viewed_by      text,
  destroyed_at   timestamptz,             -- when ciphertext was scrubbed
  constraint allowed_emails_nonempty check (cardinality(allowed_emails) > 0)
);

create index if not exists secrets_expires_at_idx on secrets (expires_at);

-- One row per "email me a code" request. Codes are stored hashed+peppered.
create table if not exists otp_challenges (
  id          uuid primary key default gen_random_uuid(),
  secret_id   uuid not null references secrets(id) on delete cascade,
  email       text not null,
  code_hash   text not null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  attempts    int not null default 0,
  consumed_at timestamptz
);

create index if not exists otp_secret_email_idx on otp_challenges (secret_id, email);
create index if not exists otp_expires_at_idx on otp_challenges (expires_at);

-- Deliberately no FK: the audit trail must outlive the secret it describes.
create table if not exists audit_log (
  id        bigserial primary key,
  secret_id uuid,
  event     text not null,
  actor     text,
  ip        inet,
  at        timestamptz not null default now(),
  detail    jsonb
);

create index if not exists audit_secret_idx on audit_log (secret_id, at desc);
