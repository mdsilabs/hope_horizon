-- Hope Horizon 0012: protect temporary credentials and restrict pending password changes.
-- Required to enforce password change at the DB/RLS layer.
-- Apply ONCE after migration 0011.
begin;

-- A user must be able to read only their own onboarding profile at login,
-- even while all school data is blocked until their password is changed.
drop policy if exists "users may read own onboarding profile" on public.users;
create policy "users may read own onboarding profile" on public.users
for select to authenticated
using (id=(select auth.uid()));

-- Do NOT let client-side Data API calls clear the required-password-change
-- flag. The trusted server uses service_role after Supabase Auth confirms
-- a successful password update.
create or replace function public.hh_protect_password_setup_flag()
returns trigger language plpgsql security definer set search_path=''
as $flag_guard$
begin
  if new.must_change_password is distinct from old.must_change_password
    and (select auth.uid()) is not null then
    raise exception 'Password setup status can only be changed by trusted server authentication'
      using errcode='42501';
  end if;
  return new;
end;
$flag_guard$;
revoke all on function public.hh_protect_password_setup_flag() from public,anon,authenticated;
drop trigger if exists hh_protect_password_setup_flag on public.users;
create trigger hh_protect_password_setup_flag
before update on public.users for each row execute function public.hh_protect_password_setup_flag();

-- All tenant and role-sensitive RLS policies resolve to NULL while a user is
-- inactive OR still has a temporary credential. This also blocks direct
-- Supabase REST API calls that might otherwise bypass Next.js pages.
create or replace function public.current_user_school_id()
returns uuid language sql stable security definer set search_path=''
as $school$
  select u.school_id from public.users u
  where u.id=(select auth.uid()) and u.is_active and not u.must_change_password;
$school$;
create or replace function public.current_user_role()
returns public.user_role language sql stable security definer set search_path=''
as $role$
  select u.role from public.users u
  where u.id=(select auth.uid()) and u.is_active and not u.must_change_password;
$role$;

-- Capability probe: account provisioning fails closed until this migration runs.
create or replace function public.hh_onboarding_guard_ready()
returns boolean language sql stable security invoker set search_path=''
as $ready$
  select true;
$ready$;
revoke all on function public.hh_onboarding_guard_ready() from public,anon;
grant execute on function public.hh_onboarding_guard_ready() to authenticated;

commit;
