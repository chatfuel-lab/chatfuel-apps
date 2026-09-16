-- OwnYourProduct app migration: two levels of staff access (Manager, Specialist).
-- Layered on the wizard's auth module schema (0001_chatfuel_auth.sql), which shares
-- its lineage with the product this came from. Apply after the auth migrations.
-- Source: fedor-jpg/agendaconmigo server/chatfuel/auth/migrations/0019_staff_access.sql,
-- lines 1-327 (members, invitations, levels) and 415-452 (the browser's own standing).
-- The product's proxy gate context, workspace states and durable records are not part of this app.

-- Two levels of staff access: Manager and Specialist.
--
-- Manager is the standing this schema already has for an owner or an admin:
-- the whole salon — settings, catalog, the assistant, who else gets in.
-- Specialist is `member` with one thing added: the calendar specialist she IS.
--
-- That link is the whole model. Everything a specialist may do is decided
-- against it on the server (server/chatfuel/staff-policy.mjs), never in the
-- browser; this migration is where the link lives, how it travels through an
-- invitation, and how it reaches the session that the policy reads. No PIN, no
-- third role: a person is either running the salon or working in it.
--
-- The specialist id is Chatfuel's (an opaque SpecialistID), so it is text here
-- and belongs to one bot — which is why it is unique per salon, not globally.

alter table public.cf_members add column if not exists specialist_id text;
alter table public.cf_members add column if not exists display_name text;
alter table public.cf_members drop constraint if exists cf_members_specialist_id_check;
alter table public.cf_members add constraint cf_members_specialist_id_check
  check (specialist_id is null or length(trim(specialist_id)) between 1 and 128);
alter table public.cf_members drop constraint if exists cf_members_display_name_check;
alter table public.cf_members add constraint cf_members_display_name_check
  check (display_name is null or length(trim(display_name)) between 1 and 120);
-- One login per calendar specialist: two people sharing a specialist would
-- each see the other's day as their own.
create unique index if not exists cf_members_specialist_idx
  on public.cf_members (tenant_id, specialist_id) where specialist_id is not null;

alter table public.cf_invites add column if not exists specialist_id text;
alter table public.cf_invites add column if not exists display_name text;
alter table public.cf_invites drop constraint if exists cf_invites_specialist_id_check;
alter table public.cf_invites add constraint cf_invites_specialist_id_check
  check (specialist_id is null or length(trim(specialist_id)) between 1 and 128);
alter table public.cf_invites drop constraint if exists cf_invites_display_name_check;
alter table public.cf_invites add constraint cf_invites_display_name_check
  check (display_name is null or length(trim(display_name)) between 1 and 120);

-- An invitation carries the standing it grants: the role, and for a specialist
-- the calendar she will open. A manager never carries one.
drop function if exists public.cf_create_invite(uuid, text, text, interval, uuid[]);
create or replace function public.cf_create_invite(
  p_tenant_id uuid, p_role text default 'member', p_email text default null,
  p_expires_in interval default interval '7 days', p_bots uuid[] default '{}',
  p_specialist_id text default null, p_display_name text default null
) returns json language plpgsql volatile security definer set search_path = '' as $$
declare v_token text; v_id uuid; v_expires timestamptz; v_bots uuid[]; v_specialist text; v_name text;
begin
  perform public.cf_require_admin(p_tenant_id);
  if p_role not in ('admin', 'member') then
    raise sqlstate 'PT422' using message = 'Role must be admin or member', hint = 'bad_role';
  end if;
  if p_expires_in is null or p_expires_in <= interval '0' or p_expires_in > interval '30 days' then
    raise sqlstate 'PT422' using message = 'Expiry must be between 1 hour and 30 days', hint = 'bad_expiry';
  end if;
  v_specialist := nullif(trim(coalesce(p_specialist_id, '')), '');
  v_name := nullif(trim(coalesce(p_display_name, '')), '');
  if v_specialist is not null and p_role <> 'member' then
    raise sqlstate 'PT422'
      using message = 'A manager reaches the whole salon and is not one specialist',
            hint = 'specialist_role_invalid';
  end if;
  if v_specialist is not null and (
    exists (
      select 1 from public.cf_members m
      where m.tenant_id = p_tenant_id and m.specialist_id = v_specialist
    ) or exists (
      -- An invitation that is still open holds the calendar as well: two
      -- pending links to one specialist would race at acceptance.
      select 1 from public.cf_invites i
      where i.tenant_id = p_tenant_id and i.specialist_id = v_specialist
        and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()
    )
  ) then
    raise sqlstate 'PT409'
      using message = 'Another login already opens this specialist''s calendar',
            hint = 'specialist_taken';
  end if;
  -- Silently dropping a foreign bot id would hand somebody a link that grants
  -- less than the person writing it meant.
  select coalesce(array_agg(b.id order by b.id), '{}'::uuid[]) into v_bots
    from public.cf_bots b where b.id = any(coalesce(p_bots, '{}'::uuid[])) and b.tenant_id = p_tenant_id;
  if coalesce(array_length(p_bots, 1), 0) <> coalesce(array_length(v_bots, 1), 0) then
    raise sqlstate 'PT404' using message = 'That bot is not in this workspace', hint = 'bot_not_found';
  end if;
  v_token := public.cf_new_token();
  v_expires := now() + p_expires_in;
  insert into public.cf_invites
    (tenant_id, token_hash, role, email, created_by, expires_at, bot_ids, specialist_id, display_name)
    values (p_tenant_id, public.cf_hash_token(v_token), p_role,
            nullif(lower(trim(p_email)), ''), auth.uid(), v_expires, v_bots, v_specialist, v_name)
    returning id into v_id;
  return json_build_object(
    'id', v_id, 'token', v_token, 'role', p_role,
    'email', nullif(lower(trim(p_email)), ''), 'expires_at', v_expires, 'bot_ids', v_bots,
    'specialist_id', v_specialist, 'display_name', v_name
  );
end $$;
revoke execute on function public.cf_create_invite(uuid, text, text, interval, uuid[], text, text)
  from public, anon, authenticated;
grant execute on function public.cf_create_invite(uuid, text, text, interval, uuid[], text, text)
  to authenticated;

-- Accepting an invitation is where the link is written. A specialist link is
-- taken only if it is still free — the invitation may have waited a week.
create or replace function public.cf_accept_invite(p_token text)
returns json language plpgsql volatile security definer set search_path = '' as $$
declare v_invite public.cf_invites%rowtype; v_current text; v_next text; v_specialist text;
begin
  if auth.uid() is null then
    raise sqlstate 'PT401' using message = 'Sign in first', hint = 'unauthenticated';
  end if;
  select * into v_invite from public.cf_invites
    where token_hash = public.cf_hash_token(p_token) for update;
  if not found then
    raise sqlstate 'PT404' using message = 'This invite link is not valid', hint = 'invite_not_found';
  end if;
  if v_invite.revoked_at is not null then
    raise sqlstate 'PT410' using message = 'This invite was revoked', hint = 'invite_revoked';
  end if;
  if v_invite.accepted_at is not null then
    raise sqlstate 'PT410' using message = 'This invite was already used', hint = 'invite_accepted';
  end if;
  if v_invite.expires_at <= now() then
    raise sqlstate 'PT410' using message = 'This invite link has expired', hint = 'invite_expired';
  end if;
  if v_invite.email is not null and lower(v_invite.email) is distinct from public.cf_auth_email() then
    raise sqlstate 'PT403' using message = 'This invite is for a different email address', hint = 'email_mismatch';
  end if;
  v_specialist := v_invite.specialist_id;
  if v_specialist is not null and exists (
    select 1 from public.cf_members m
    where m.tenant_id = v_invite.tenant_id and m.specialist_id = v_specialist and m.user_id <> auth.uid()
  ) then
    raise sqlstate 'PT409'
      using message = 'Another login already opens this specialist''s calendar',
            hint = 'specialist_taken';
  end if;
  select role into v_current from public.cf_members
    where tenant_id = v_invite.tenant_id and user_id = auth.uid();
  if v_current is null then
    insert into public.cf_members (tenant_id, user_id, role, specialist_id, display_name)
      values (v_invite.tenant_id, auth.uid(), v_invite.role, v_specialist, v_invite.display_name);
  else
    -- Never a demotion: a manager who is also invited as a specialist keeps the
    -- salon, and a manager carries no calendar link.
    v_next := case
      when public.cf_role_rank(v_invite.role) > public.cf_role_rank(v_current) then v_invite.role
      else v_current
    end;
    update public.cf_members
    set role = v_next,
        specialist_id = case when v_next = 'member' then coalesce(v_specialist, specialist_id) else null end,
        display_name = coalesce(v_invite.display_name, display_name)
    where tenant_id = v_invite.tenant_id and user_id = auth.uid();
  end if;
  -- The bots the invite carries. Harmless for an admin, who reaches all of them
  -- anyway; it matters the day they are demoted to member. A specialist gets
  -- the salon's bots outright: her calendar lives in them, and an invitation
  -- that grants none would sign her in to nothing.
  insert into public.cf_bot_members (bot, user_id)
    select b.id, auth.uid() from public.cf_bots b
    where b.tenant_id = v_invite.tenant_id
      and (b.id = any(v_invite.bot_ids) or v_specialist is not null)
    on conflict (bot, user_id) do nothing;
  update public.cf_invites set accepted_at = now(), accepted_by = auth.uid() where id = v_invite.id;
  return public.cf_my_membership(v_invite.tenant_id);
end $$;
revoke execute on function public.cf_accept_invite(text) from public, anon, authenticated;
grant execute on function public.cf_accept_invite(text) to authenticated;

-- A manager fixes a link that was set wrong, or hands a calendar to someone
-- else. Promoting a person to manager drops it: a manager is not one calendar.
create or replace function public.cf_set_member_specialist(
  p_tenant_id uuid, p_user_id uuid, p_specialist_id text
)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_role text; v_specialist text;
begin
  perform public.cf_require_admin(p_tenant_id);
  v_specialist := nullif(trim(coalesce(p_specialist_id, '')), '');
  select role into v_role from public.cf_members where tenant_id = p_tenant_id and user_id = p_user_id;
  if v_role is null then
    raise sqlstate 'PT404' using message = 'Member not found', hint = 'member_not_found';
  end if;
  if v_specialist is not null and v_role <> 'member' then
    raise sqlstate 'PT422'
      using message = 'A manager reaches the whole salon and is not one specialist',
            hint = 'specialist_role_invalid';
  end if;
  if v_specialist is not null and (
    exists (
      select 1 from public.cf_members m
      where m.tenant_id = p_tenant_id and m.specialist_id = v_specialist and m.user_id <> p_user_id
    ) or exists (
      -- An invitation still waiting for its person holds the calendar as well:
      -- handing it to somebody else now would leave her invitation impossible
      -- to accept.
      select 1 from public.cf_invites i
      where i.tenant_id = p_tenant_id and i.specialist_id = v_specialist
        and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()
    )
  ) then
    raise sqlstate 'PT409'
      using message = 'Another login already opens this specialist''s calendar',
            hint = 'specialist_taken';
  end if;
  update public.cf_members set specialist_id = v_specialist
  where tenant_id = p_tenant_id and user_id = p_user_id;
end $$;
revoke execute on function public.cf_set_member_specialist(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.cf_set_member_specialist(uuid, uuid, text) to authenticated;

-- A promotion to manager is a promotion out of one calendar — and a move the
-- other way has to NAME the calendar. A `member` with no link is a member with
-- the run of the salon (that is what a member was before this migration), so
-- "make her a specialist" without one would widen her access, not narrow it.
drop function if exists public.cf_change_member_role(uuid, uuid, text);
create or replace function public.cf_change_member_role(
  p_tenant_id uuid, p_user_id uuid, p_role text, p_specialist_id text default null
)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare v_target text; v_specialist text;
begin
  perform public.cf_require_admin(p_tenant_id);
  if p_role not in ('admin', 'member') then
    raise sqlstate 'PT422' using message = 'Role must be admin or member', hint = 'bad_role';
  end if;
  if p_user_id = auth.uid() then
    raise sqlstate 'PT422' using message = 'You cannot change your own role', hint = 'self_target';
  end if;
  select role, specialist_id into v_target, v_specialist
  from public.cf_members where tenant_id = p_tenant_id and user_id = p_user_id;
  if v_target is null then
    raise sqlstate 'PT404' using message = 'Member not found', hint = 'member_not_found';
  end if;
  if v_target = 'owner' then
    raise sqlstate 'PT409' using message = 'The owner''s role changes only by transferring ownership', hint = 'is_owner';
  end if;
  if p_role = 'admin' then
    update public.cf_members set role = 'admin', specialist_id = null
    where tenant_id = p_tenant_id and user_id = p_user_id;
    return;
  end if;
  v_specialist := coalesce(nullif(trim(coalesce(p_specialist_id, '')), ''), v_specialist);
  if v_specialist is null then
    raise sqlstate 'PT422'
      using message = 'Choose which calendar this person opens',
            hint = 'specialist_required';
  end if;
  if exists (
    select 1 from public.cf_members m
    where m.tenant_id = p_tenant_id and m.specialist_id = v_specialist and m.user_id <> p_user_id
  ) or exists (
    select 1 from public.cf_invites i
    where i.tenant_id = p_tenant_id and i.specialist_id = v_specialist
      and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()
  ) then
    raise sqlstate 'PT409'
      using message = 'Another login already opens this specialist''s calendar',
            hint = 'specialist_taken';
  end if;
  update public.cf_members set role = 'member', specialist_id = v_specialist
  where tenant_id = p_tenant_id and user_id = p_user_id;
end $$;
revoke execute on function public.cf_change_member_role(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.cf_change_member_role(uuid, uuid, text, text) to authenticated;

-- The staff screen also cancels an invitation and takes an access away. The
-- pilot closed both to the browser (0003) when the operator panel was the only
-- place staff existed; the salon's own manager needs them now.
revoke execute on function public.cf_revoke_invite(uuid) from public, anon;
grant execute on function public.cf_revoke_invite(uuid) to authenticated;
revoke execute on function public.cf_remove_member(uuid, uuid) from public, anon;
grant execute on function public.cf_remove_member(uuid, uuid) to authenticated;

-- The staff screen: who is in, at what level, opening which calendar.
drop function if exists public.cf_list_members(uuid);
create or replace function public.cf_list_members(p_tenant_id uuid)
returns table (
  user_id uuid, role text, email text, full_name text, avatar_url text, joined_at timestamptz,
  bots uuid[], specialist_id text, display_name text
) language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.cf_require_admin(p_tenant_id);
  return query
    select m.user_id, m.role, p.email, p.full_name, p.avatar_url, m.created_at,
      -- Empty for an owner or admin, who reach every bot without a grant.
      coalesce((select array_agg(g.bot order by g.bot)
                from public.cf_bot_members g
                join public.cf_bots b on b.id = g.bot
                where g.user_id = m.user_id and b.tenant_id = p_tenant_id), '{}'::uuid[]),
      m.specialist_id, m.display_name
    from public.cf_members m
    left join public.cf_profiles p on p.id = m.user_id
    where m.tenant_id = p_tenant_id
    order by public.cf_role_rank(m.role) desc, m.created_at asc;
end $$;
revoke execute on function public.cf_list_members(uuid) from public, anon, authenticated;
grant execute on function public.cf_list_members(uuid) to authenticated;

drop function if exists public.cf_list_invites(uuid);
create or replace function public.cf_list_invites(p_tenant_id uuid)
returns table (
  id uuid, role text, email text, created_by uuid, created_by_name text,
  created_at timestamptz, expires_at timestamptz, status text, bot_ids uuid[],
  specialist_id text, display_name text
) language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.cf_require_admin(p_tenant_id);
  return query
    select i.id, i.role, i.email, i.created_by, coalesce(p.full_name, p.email),
      i.created_at, i.expires_at,
      case
        when i.revoked_at is not null then 'revoked'
        when i.accepted_at is not null then 'accepted'
        when i.expires_at <= now() then 'expired'
        else 'pending' end,
      i.bot_ids, i.specialist_id, i.display_name
    from public.cf_invites i
    left join public.cf_profiles p on p.id = i.created_by
    where i.tenant_id = p_tenant_id
    order by i.created_at desc;
end $$;
revoke execute on function public.cf_list_invites(uuid) from public, anon, authenticated;
grant execute on function public.cf_list_invites(uuid) to authenticated;


-- The same two facts where the browser reads its own standing, so the app can
-- show a specialist her calendar and nothing she cannot use.
create or replace function public.cf_my_membership(p_tenant_id uuid)
returns json language sql stable security definer set search_path = '' as $$
  select json_build_object(
    'role', m.role,
    'specialist_id', case when m.role = 'member' then m.specialist_id else null end,
    'display_name', m.display_name,
    'joined_at', m.created_at,
    'tenant', json_build_object('id', t.id, 'name', t.name, 'bots', public.cf_my_bots_json(t.id))
  )
  from public.cf_members m
  join public.cf_tenants t on t.id = m.tenant_id
  where m.tenant_id = p_tenant_id and m.user_id = auth.uid()
$$;
revoke execute on function public.cf_my_membership(uuid) from public, anon, authenticated;
grant execute on function public.cf_my_membership(uuid) to authenticated;

create or replace function public.cf_my_workspace()
returns json language sql stable security definer set search_path = '' as $$
  select json_build_object(
    'tenant_id', t.id,
    'name', t.name,
    'role', m.role,
    'specialist_id', case when m.role = 'member' then m.specialist_id else null end,
    'display_name', m.display_name,
    'joined_at', m.created_at,
    'bots', public.cf_my_bots_json(t.id)
  )
  from public.cf_members m
  join public.cf_tenants t on t.id = m.tenant_id
  where m.user_id = auth.uid()
  order by (t.created_by = auth.uid()) desc, m.created_at asc
  limit 1
$$;
revoke execute on function public.cf_my_workspace() from public, anon, authenticated;
grant execute on function public.cf_my_workspace() to authenticated;

