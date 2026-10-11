-- Hope Horizon migration 0008: equal-rights co-admins, immutable primary admins.
-- Run ONCE after 0007. Existing ADMIN accounts are preserved as PRIMARY.
-- CO_ADMIN is a designation: RLS and server role checks continue using ADMIN.
begin;

alter table public.users add column if not exists admin_tier text;
update public.users set admin_tier = 'PRIMARY'
  where role = 'ADMIN'::public.user_role and admin_tier is null;

alter table public.users
  add constraint hh_user_admin_tier_matches_role check (
    (role = 'ADMIN'::public.user_role and admin_tier in ('PRIMARY', 'CO_ADMIN'))
    or (role <> 'ADMIN'::public.user_role and admin_tier is null)
  );

-- Accounts are provisioned through trusted app_metadata, not user-editable metadata.
-- An initial PRIMARY can only be created in a school without an admin.
-- Subsequent admins must be CO_ADMIN; no app workflow promotes CO_ADMIN to PRIMARY.
create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_school text := new.raw_app_meta_data ->> 'school_id';
  v_role text := new.raw_app_meta_data ->> 'role';
  v_tier text := new.raw_app_meta_data ->> 'admin_tier';
  v_school_id uuid;
begin
  if v_school is null or v_role is null then
    raise exception 'Account must be provisioned by the school administrator'
      using errcode = '42501';
  end if;
  v_school_id := v_school::uuid;
  -- Serialize privileged provisioning in one school.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(v_school_id::text), 832206);
  if v_role = 'ADMIN' then
    if v_tier = 'PRIMARY' then
      if exists (select 1 from public.users u
                 where u.school_id = v_school_id and u.role = 'ADMIN'::public.user_role) then
        raise exception 'School already has an administrator; create a CO_ADMIN'
          using errcode = '42501';
      end if;
    elsif v_tier = 'CO_ADMIN' then
      if not exists (select 1 from public.users u
                     where u.school_id = v_school_id and u.role = 'ADMIN'::public.user_role
                       and u.admin_tier = 'PRIMARY' and u.is_active) then
        raise exception 'Create the primary administrator first'
          using errcode = '42501';
      end if;
    else
      raise exception 'ADMIN provisioning requires a trusted admin_tier'
        using errcode = '42501';
    end if;
  elsif v_tier is not null then
    raise exception 'Only administrators may have an admin tier'
      using errcode = '42501';
  end if;

  insert into public.users
    (id,school_id,name,email,role,must_change_password,admin_tier)
  values (
    new.id, v_school_id,
    coalesce(nullif(new.raw_user_meta_data->>'name',''),new.email),
    new.email, v_role::public.user_role,
    coalesce((new.raw_app_meta_data->>'must_change_password')::boolean,false),
    v_tier
  );
  return new;
end;
$$;

-- RLS alone is insufficient: the original admin must not be demoted,
-- deactivated or deleted, even by an authenticated co-admin using a
-- privileged app endpoint. A DB owner may still perform manual recovery.
create or replace function public.hh_guard_admin_identity()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      raise exception 'User identities must be created by the trusted Auth workflow'
        using errcode = '42501';
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    if old.role = 'ADMIN'::public.user_role and old.admin_tier = 'PRIMARY' then
      raise exception 'The primary administrator cannot be deleted'
        using errcode = '42501';
    end if;
    return old;
  else
    if row(new.id,new.school_id,new.role,new.admin_tier) is distinct from
       row(old.id,old.school_id,old.role,old.admin_tier) then
      raise exception 'Identity, school, administrator tier and role are immutable'
        using errcode = '42501';
    end if;
    if old.role = 'ADMIN'::public.user_role and old.admin_tier = 'PRIMARY'
       and (new.is_active is distinct from old.is_active
            or new.email is distinct from old.email) then
      raise exception 'The primary administrator cannot be disabled or reassigned'
        using errcode = '42501';
    end if;
    return new;
  end if;
end;
$$;
revoke all on function public.hh_guard_admin_identity() from public, anon, authenticated;
drop trigger if exists hh_admin_identity_guard on public.users;
create trigger hh_admin_identity_guard
  before insert or update or delete on public.users
  for each row execute function public.hh_guard_admin_identity();

-- An inactive Co-Admin might retain an unexpired Supabase JWT.
-- Return no school and no app role for inactive profiles so RLS rejects
-- their direct PostgREST requests, even when bypassing the Next.js UI.
create or replace function public.current_user_school_id()
returns uuid language sql stable security definer set search_path = ''
as $
  select u.school_id from public.users u
  where u.id = (select auth.uid()) and u.is_active;
$;
create or replace function public.current_user_role()
returns public.user_role language sql stable security definer set search_path = ''
as $
  select u.role from public.users u
  where u.id = (select auth.uid()) and u.is_active;
$;

commit;

-- Check the existing administrators' designation:
-- select name,email,admin_tier,is_active from public.users where role='ADMIN';
