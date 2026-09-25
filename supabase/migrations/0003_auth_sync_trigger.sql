-- ============================================================
-- Migration 0003: auth.users -> public.users sync
-- ============================================================
-- New accounts are created server-side via the Supabase Admin API
-- (see scripts/seed.ts and any future "create staff/student/parent"
-- flow), passing school_id/role/name in user_metadata. This trigger
-- copies that metadata into public.users automatically so the two
-- tables never drift out of sync.

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, school_id, name, email, role, must_change_password)
  values (
    new.id,
    (new.raw_user_meta_data ->> 'school_id')::uuid,
    coalesce(new.raw_user_meta_data ->> 'name', new.email),
    new.email,
    coalesce((new.raw_user_meta_data ->> 'role')::user_role, 'OTHER'),
    coalesce((new.raw_user_meta_data ->> 'must_change_password')::boolean, false)
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();
