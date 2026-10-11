-- Hope Horizon migration 0007: profile avatars and administrator Cloudinary settings
-- Apply after 0001–0006 on your chosen Supabase project.
begin;

alter table public.users
  add column if not exists avatar_url text,
  add column if not exists avatar_uploaded_at timestamptz;

-- The avatar must be set by the authenticated server upload handler using
-- a server-only credential, never by user-supplied URL in a profile update.
create or replace function public.hh_protect_user_avatar()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is not null and (
    new.avatar_url is distinct from old.avatar_url or
    new.avatar_uploaded_at is distinct from old.avatar_uploaded_at
  ) then
    raise exception 'Avatar updates must use the verified upload endpoint'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.hh_protect_user_avatar() from public, anon, authenticated;
drop trigger if exists hh_user_avatar_write_guard on public.users;
create trigger hh_user_avatar_write_guard
  before update on public.users
  for each row execute function public.hh_protect_user_avatar();

-- These fields are NON-SECRET public Cloudinary identifiers/settings.
-- API key and API secret remain only as private Vercel environment variables.
create table if not exists public.school_media_settings (
  school_id uuid primary key references public.schools(id) on delete cascade,
  cloud_name text not null check (cloud_name ~ '^[a-zA-Z0-9_-]{2,80}$'),
  folder text not null default 'avatars'
    check (folder ~ '^[a-zA-Z0-9_-]{2,48}$'),
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.school_media_settings enable row level security;
drop policy if exists "school admins read Cloudinary settings" on public.school_media_settings;
create policy "school admins read Cloudinary settings" on public.school_media_settings
  for select to authenticated
  using (school_id = (select public.current_user_school_id())
    and (select public.current_user_role()) = 'ADMIN');
drop policy if exists "school admins insert Cloudinary settings" on public.school_media_settings;
create policy "school admins insert Cloudinary settings" on public.school_media_settings
  for insert to authenticated
  with check (school_id = (select public.current_user_school_id())
    and (select public.current_user_role()) = 'ADMIN');
drop policy if exists "school admins update Cloudinary settings" on public.school_media_settings;
create policy "school admins update Cloudinary settings" on public.school_media_settings
  for update to authenticated
  using (school_id = (select public.current_user_school_id())
    and (select public.current_user_role()) = 'ADMIN')
  with check (school_id = (select public.current_user_school_id())
    and (select public.current_user_role()) = 'ADMIN');

drop trigger if exists set_updated_at on public.school_media_settings;
create trigger set_updated_at before update on public.school_media_settings
  for each row execute function public.set_updated_at();

commit;
