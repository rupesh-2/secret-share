-- Inseed Vault — sharing RPCs.
-- Sharing needs SECURITY DEFINER helpers because a normal user cannot read
-- other people's `profiles` (RLS), so email->user resolution and the grantee
-- email list must run in a definer context that also re-checks ownership.
-- Re-runnable: all functions use create-or-replace.

-- Share a secret with another Inseed user by email. Owner-only. Upserts so
-- re-sharing updates the permission instead of erroring.
create or replace function public.share_secret(
  p_secret_id  uuid,
  p_grantee_email text,
  p_permission permission_level
) returns void language plpgsql security definer set search_path = public as $$
declare
  v_grantee uuid;
begin
  if secret_permission(p_secret_id) <> 'owner' then
    raise exception 'only the owner can share this secret';
  end if;

  select id into v_grantee from profiles where email = lower(p_grantee_email);
  if v_grantee is null then
    raise exception 'no Inseed user with that email has signed in yet';
  end if;
  if v_grantee = auth.uid() then
    raise exception 'you already own this secret';
  end if;

  insert into secret_shares (secret_id, grantee_user_id, permission, granted_by)
  values (p_secret_id, v_grantee, p_permission, auth.uid())
  on conflict (secret_id, grantee_user_id)
    do update set permission = excluded.permission;

  perform write_audit('secret_shared', 'secret', p_secret_id,
    jsonb_build_object('grantee', lower(p_grantee_email), 'permission', p_permission));
end;
$$;

-- List a secret's shares with grantee emails. Owner-only (the ownership check
-- is in the WHERE so a non-owner simply gets zero rows).
create or replace function public.list_secret_shares(p_secret_id uuid)
returns table (
  share_id      uuid,
  grantee_email text,
  permission    permission_level,
  created_at    timestamptz
) language sql stable security definer set search_path = public as $$
  select sh.id, p.email, sh.permission, sh.created_at
  from secret_shares sh
  join profiles p on p.id = sh.grantee_user_id
  where sh.secret_id = p_secret_id
    and public.secret_permission(p_secret_id) = 'owner'
  order by sh.created_at;
$$;

-- Revoke a share. Owner-only.
create or replace function public.revoke_share(p_share_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_secret uuid;
begin
  select secret_id into v_secret from secret_shares where id = p_share_id;
  if v_secret is null then
    return; -- already gone
  end if;
  if secret_permission(v_secret) <> 'owner' then
    raise exception 'only the owner can revoke access';
  end if;

  delete from secret_shares where id = p_share_id;
  perform write_audit('secret_share_revoked', 'secret', v_secret,
    jsonb_build_object('share_id', p_share_id));
end;
$$;

grant execute on function public.share_secret(uuid, text, permission_level) to authenticated;
grant execute on function public.list_secret_shares(uuid) to authenticated;
grant execute on function public.revoke_share(uuid) to authenticated;
