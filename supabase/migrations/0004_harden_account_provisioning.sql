-- Security hardening: privileged account fields must not be user-editable.
-- IMPORTANT: apply after migrations 0001-0003, before allowing enrolment.
-- 0003 originally accepted role/school_id from user_metadata, which users
-- can set themselves. Only service-role-controlled app_metadata is trusted.

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  trusted_school_id text;
  trusted_role text;
begin
  trusted_school_id := new.raw_app_meta_data ->> 'school_id';
  trusted_role := new.raw_app_meta_data ->> 'role';

  -- Fail closed. Accounts must be created by a privileged, trusted workflow.
  if trusted_school_id is null or trusted_role is null then
    raise exception 'Account must be provisioned by the school administrator.'
      using errcode = '42501';
  end if;

  insert into public.users (id, school_id, name, email, role, must_change_password)
  values (
    new.id,
    trusted_school_id::uuid,
    coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), new.email),
    new.email,
    trusted_role::public.user_role,
    coalesce((new.raw_app_meta_data ->> 'must_change_password')::boolean, false)
  );
  return new;
end;
$$;

-- Protect identity and authorization fields even though the self-service
-- profile UPDATE RLS policy permits editing non-privileged contact fields.
-- service-role database operations (auth.uid() is null) remain supported.
create or replace function public.guard_user_authorization_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_role public.user_role;
begin
  if auth.uid() is not null then
    select role into actor_role from public.users where id = auth.uid();
    if actor_role is distinct from 'ADMIN'::public.user_role then
      if row(new.id, new.school_id, new.role, new.email, new.is_active, new.must_change_password)
         is distinct from
         row(old.id, old.school_id, old.role, old.email, old.is_active, old.must_change_password) then
        raise exception 'Only a school administrator can edit account authorization fields.'
          using errcode = '42501';
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_user_role_escalation on public.users;
create trigger prevent_user_role_escalation
  before update on public.users
  for each row execute function public.guard_user_authorization_columns();

drop policy if exists "users can update their own profile" on public.users;
create policy "users can update their own contact profile"
  on public.users for update
  using (id = auth.uid() and school_id = public.current_user_school_id())
  with check (id = auth.uid() and school_id = public.current_user_school_id());

-- Both sides of a class-subject assignment must belong to one school.
drop policy if exists "admins manage class_subjects" on public.class_subjects;
create policy "admins manage class_subjects"
  on public.class_subjects for all
  using (
    public.current_user_role() = 'ADMIN'
    and exists (
      select 1 from public.classes c
      join public.subjects s on s.school_id = c.school_id
      where c.id = class_id and s.id = subject_id
        and c.school_id = public.current_user_school_id()
    )
  )
  with check (
    public.current_user_role() = 'ADMIN'
    and exists (
      select 1 from public.classes c
      join public.subjects s on s.school_id = c.school_id
      where c.id = class_id and s.id = subject_id
        and c.school_id = public.current_user_school_id()
    )
  );
