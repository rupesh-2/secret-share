-- Inseed Vault — initial schema, RLS, and triggers.
-- Target: Supabase Postgres. Apply via the SQL editor or `supabase db push`.
-- Design reference: docs blueprint §3 (schema), §11 (RLS), §2 (auth/domain).
--
-- Model reminder: only the SECRET VALUE is envelope-encrypted (secret_values).
-- Metadata (title/url/username/tags) is plaintext-in-row for instant search,
-- protected by RLS + at-rest disk encryption.

-- ---------------------------------------------------------- dev teardown ---
-- Makes this script safe to re-run while iterating: drops the vault's own
-- objects if a previous (possibly partial) run left them behind. Table drops
-- cascade to their policies, triggers, and indexes. Safe ONLY because there is
-- no production data yet — REMOVE this block before real deployments.
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user() cascade;
drop table if exists
  notifications, audit_logs, one_time_links, secret_tags, tags,
  secret_shares, secret_values, secrets, folders, team_members, teams, profiles
  cascade;
drop type if exists secret_type, permission_level, team_role, app_role cascade;

-- ------------------------------------------------------------------ enums ---
create type app_role       as enum ('user', 'admin');
create type team_role       as enum ('owner', 'member');
create type permission_level as enum ('read', 'edit', 'owner');
create type secret_type     as enum
  ('password', 'api_key', 'ssh_key', 'token', 'note', 'env', 'db_cred');

-- --------------------------------------------------------------- profiles ---
-- 1:1 with auth.users. The domain CHECK is the DB-level enforcement of the
-- "@inseed.dev only" rule: a non-matching signup fails handle_new_user() and
-- the whole auth transaction rolls back. Configure the Supabase "Before User
-- Created" auth hook as belt-and-suspenders (see §2).
create table profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  email         text not null unique,
  full_name     text,
  role          app_role not null default 'user',
  session_epoch int  not null default 0,   -- bump to invalidate all sessions
  disabled_at   timestamptz,
  created_at    timestamptz not null default now(),
  constraint email_domain_allowed
    check (lower(split_part(email, '@', 2)) = 'inseed.dev')
);

-- Create the profile when a new auth user appears.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    lower(new.email),
    coalesce(new.raw_user_meta_data ->> 'full_name',
             new.raw_user_meta_data ->> 'name')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------- teams & memberships ------
create table teams (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  slug       text not null unique,
  created_by uuid not null references profiles (id),
  created_at timestamptz not null default now()
);

create table team_members (
  team_id uuid not null references teams (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  role    team_role not null default 'member',
  primary key (team_id, user_id)
);

-- ------------------------------------------------------------- folders -------
create table folders (
  id        uuid primary key default gen_random_uuid(),
  owner_id  uuid not null references profiles (id) on delete cascade,
  parent_id uuid references folders (id) on delete cascade,
  name      text not null,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------- secrets -------
-- Metadata only. No secret value lives here.
create table secrets (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references profiles (id) on delete cascade,
  folder_id   uuid references folders (id) on delete set null,
  type        secret_type not null default 'password',
  title       text not null,
  username    text,
  url         text,
  description text,
  created_by  uuid not null references profiles (id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

-- The encrypted payload. One row per version; current = highest version.
create table secret_values (
  secret_id  uuid not null references secrets (id) on delete cascade,
  version    int  not null default 1,
  -- ciphertext and wrapped_dek are self-contained base64 blobs packing
  -- iv‖tag‖ct (see lib/crypto/envelope.ts). iv/auth_tag columns are kept
  -- nullable for a future split-column or KMS layout.
  ciphertext  text not null,
  iv          text,
  auth_tag    text,
  wrapped_dek text not null,       -- DEK wrapped by the KEK
  kek_id      text not null,       -- which KEK version wrapped this DEK
  created_at  timestamptz not null default now(),
  primary key (secret_id, version)
);

-- ------------------------------------------------------- shares & tags ------
create table secret_shares (
  id               uuid primary key default gen_random_uuid(),
  secret_id        uuid not null references secrets (id) on delete cascade,
  grantee_user_id  uuid references profiles (id) on delete cascade,
  grantee_team_id  uuid references teams (id) on delete cascade,
  permission       permission_level not null default 'read',
  granted_by       uuid not null references profiles (id),
  created_at       timestamptz not null default now(),
  -- exactly one of user/team is set
  constraint one_grantee check (num_nonnulls(grantee_user_id, grantee_team_id) = 1),
  unique (secret_id, grantee_user_id),
  unique (secret_id, grantee_team_id)
);

create table tags (
  id       uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles (id) on delete cascade,
  name     text not null,
  unique (owner_id, name)
);

create table secret_tags (
  secret_id uuid not null references secrets (id) on delete cascade,
  tag_id    uuid not null references tags (id) on delete cascade,
  primary key (secret_id, tag_id)
);

-- --------------------------------------------------------- one-time links ---
create table one_time_links (
  id                uuid primary key default gen_random_uuid(),
  token_hash        text not null unique,   -- sha256 of the URL token
  secret_id         uuid references secrets (id) on delete cascade,
  inline_ciphertext text,                   -- for ad-hoc (non-vault) values
  iv                text,
  wrapped_dek       text,
  kek_id            text,
  passphrase_hash   text,                   -- Argon2id, optional
  max_views         int  not null default 1,
  viewed_at         timestamptz,
  created_by        uuid not null references profiles (id),
  expires_at        timestamptz not null,
  created_at        timestamptz not null default now()
);

-- ----------------------------------------------------------- audit_logs -----
-- Append-only, hash-chained. Inserts happen via SECURITY DEFINER / service role.
create table audit_logs (
  id          bigserial primary key,
  actor_id    uuid references profiles (id),
  event       text not null,
  target_type text,
  target_id   uuid,
  ip          inet,
  user_agent  text,
  metadata    jsonb,
  prev_hash   text,
  row_hash    text,
  created_at  timestamptz not null default now()
);

-- --------------------------------------------------------- notifications ----
create table notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles (id) on delete cascade,
  kind       text not null,
  payload    jsonb,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);

-- --------------------------------------------------------------- indexes ----
create index secrets_owner_idx        on secrets (owner_id) where deleted_at is null;
create index secrets_folder_idx       on secrets (folder_id);
create index secrets_search_idx       on secrets using gin
  (to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(url,'') || ' ' || coalesce(username,'')));
create index shares_user_idx          on secret_shares (grantee_user_id);
create index shares_team_idx          on secret_shares (grantee_team_id);
create index team_members_user_idx    on team_members (user_id);
create index audit_actor_idx          on audit_logs (actor_id, created_at desc);
create index notifications_user_idx   on notifications (user_id, created_at desc);

-- =====================================================================
--  RLS helper functions (SECURITY DEFINER — break policy recursion)
-- =====================================================================
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role = 'admin' and disabled_at is null
  );
$$;

create or replace function public.is_team_member(tid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from team_members where team_id = tid and user_id = auth.uid()
  );
$$;

create or replace function public.is_team_owner(tid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from team_members
    where team_id = tid and user_id = auth.uid() and role = 'owner'
  ) or exists (
    select 1 from teams where id = tid and created_by = auth.uid()
  );
$$;

-- Highest permission the current user holds on a secret, or null if none.
-- Bypasses RLS internally so policies referencing it never recurse.
create or replace function public.secret_permission(sid uuid)
returns permission_level language sql stable security definer set search_path = public as $$
  select case
    when exists (select 1 from secrets s where s.id = sid and s.owner_id = auth.uid())
      then 'owner'::permission_level
    else (
      select max(sh.permission)
      from secret_shares sh
      where sh.secret_id = sid and (
        sh.grantee_user_id = auth.uid()
        or sh.grantee_team_id in (
          select team_id from team_members where user_id = auth.uid()
        )
      )
    )
  end;
$$;

-- =====================================================================
--  Row Level Security
-- =====================================================================
alter table profiles       enable row level security;
alter table teams          enable row level security;
alter table team_members   enable row level security;
alter table folders        enable row level security;
alter table secrets        enable row level security;
alter table secret_values  enable row level security;
alter table secret_shares  enable row level security;
alter table tags           enable row level security;
alter table secret_tags    enable row level security;
alter table one_time_links enable row level security;
alter table audit_logs     enable row level security;
alter table notifications  enable row level security;

-- profiles: read self or (as admin) anyone; update only your own mutable fields.
create policy profiles_select on profiles for select
  using (id = auth.uid() or is_admin());
create policy profiles_update_self on profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

-- teams: members and admins see; any authenticated user may create a team.
create policy teams_select on teams for select
  using (is_team_member(id) or is_admin());
create policy teams_insert on teams for insert
  with check (created_by = auth.uid());

-- team_members: see your rows / your teams / admin. Team owners manage members.
create policy team_members_select on team_members for select
  using (user_id = auth.uid() or is_team_member(team_id) or is_admin());
create policy team_members_write on team_members for all
  using (is_admin() or is_team_owner(team_id))
  with check (is_admin() or is_team_owner(team_id));

-- folders: fully owner-scoped.
create policy folders_all on folders for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- secrets: owner or any active share. NOTE: admins are intentionally excluded.
create policy secrets_select on secrets for select
  using (secret_permission(id) is not null);
create policy secrets_insert on secrets for insert
  with check (owner_id = auth.uid() and created_by = auth.uid());
create policy secrets_update on secrets for update
  using (secret_permission(id) in ('edit', 'owner'))
  with check (secret_permission(id) in ('edit', 'owner'));
create policy secrets_delete on secrets for delete
  using (owner_id = auth.uid());

-- secret_values: ride the parent secret's permission.
create policy values_select on secret_values for select
  using (secret_permission(secret_id) is not null);
create policy values_write on secret_values for all
  using (secret_permission(secret_id) in ('edit', 'owner'))
  with check (secret_permission(secret_id) in ('edit', 'owner'));

-- secret_shares: the secret's owner manages; grantee can see their own grant.
create policy shares_select on secret_shares for select
  using (
    secret_permission(secret_id) = 'owner'
    or grantee_user_id = auth.uid()
    or is_team_member(grantee_team_id)
  );
create policy shares_write on secret_shares for all
  using (secret_permission(secret_id) = 'owner')
  with check (secret_permission(secret_id) = 'owner' and granted_by = auth.uid());

-- tags / secret_tags: owner-scoped.
create policy tags_all on tags for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy secret_tags_all on secret_tags for all
  using (secret_permission(secret_id) is not null)
  with check (secret_permission(secret_id) in ('edit', 'owner'));

-- one_time_links: creator manages; the anonymous reveal path uses the service
-- role server-side, so no public SELECT policy is granted here.
create policy otl_select on one_time_links for select
  using (created_by = auth.uid());
create policy otl_insert on one_time_links for insert
  with check (created_by = auth.uid());
create policy otl_delete on one_time_links for delete
  using (created_by = auth.uid());

-- audit_logs: read your own actions or (as admin) all. No insert/update/delete
-- policy exists → those are denied for authenticated; writes go via service role.
create policy audit_select on audit_logs for select
  using (actor_id = auth.uid() or is_admin());

-- notifications: your own only.
create policy notifications_select on notifications for select
  using (user_id = auth.uid());
create policy notifications_update on notifications for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- =====================================================================
--  Triggers: updated_at + audit immutability
-- =====================================================================
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger secrets_touch
  before update on secrets
  for each row execute function public.touch_updated_at();

-- Audit log is append-only: block every UPDATE and DELETE at the row level.
create or replace function public.audit_immutable()
returns trigger language plpgsql as $$
begin
  raise exception 'audit_logs is append-only';
end;
$$;

create trigger audit_no_update
  before update or delete on audit_logs
  for each row execute function public.audit_immutable();

-- =====================================================================
--  RPCs: atomic writes callable by authenticated users (design §6, §10)
-- =====================================================================

-- Append an audit row as the current user. SECURITY DEFINER so authenticated
-- can write despite audit_logs having no INSERT policy.
create or replace function public.write_audit(
  p_event       text,
  p_target_type text default null,
  p_target_id   uuid default null,
  p_metadata    jsonb default null,
  p_ip          inet default null,
  p_user_agent  text default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  insert into audit_logs (actor_id, event, target_type, target_id, metadata, ip, user_agent)
  values (auth.uid(), p_event, p_target_type, p_target_id, p_metadata, p_ip, p_user_agent);
end;
$$;

-- Create a secret and its first (encrypted) version atomically. The plaintext
-- value is encrypted in the Node route; only ciphertext reaches this function.
create or replace function public.create_secret(
  p_type        secret_type,
  p_title       text,
  p_username    text,
  p_url         text,
  p_description text,
  p_folder_id   uuid,
  p_ciphertext  text,
  p_wrapped_dek text,
  p_kek_id      text
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  insert into secrets (owner_id, folder_id, type, title, username, url, description, created_by)
  values (auth.uid(), p_folder_id, p_type, p_title, p_username, p_url, p_description, auth.uid())
  returning id into v_id;

  insert into secret_values (secret_id, version, ciphertext, wrapped_dek, kek_id)
  values (v_id, 1, p_ciphertext, p_wrapped_dek, p_kek_id);

  perform write_audit('secret_created', 'secret', v_id);
  return v_id;
end;
$$;

-- =====================================================================
--  Grants: authenticated role gets table access; RLS restricts the rows.
-- =====================================================================
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on function public.write_audit(text, text, uuid, jsonb, inet, text) to authenticated;
grant execute on function public.create_secret(secret_type, text, text, text, text, uuid, text, text, text) to authenticated;
