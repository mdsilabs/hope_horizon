-- Hope Horizon Academy: COMPLETE FRESH DATABASE INSTALL 0001-0005
-- Target: supabase-cyclamen-park (iwfpdwihinhcwjgvmfei)
-- Use only on a new Hope Horizon database with NO existing portal tables.
-- Original migrations 0001-0005 run in one transaction, so the legacy 0003
-- trigger is replaced by its hardened 0004 version before COMMIT.
-- Never rerun this script after a successful installation.
-- No passwords, signing secrets or service keys are included.

BEGIN;
DO $preflight$
BEGIN
  IF to_regclass('public.schools') IS NOT NULL OR to_regclass('public.users') IS NOT NULL THEN
    RAISE EXCEPTION 'Hope Horizon tables already exist. Apply only pending migrations, not a fresh install.';
  END IF;
END
$preflight$;


-- ===== BEGIN 0001_init.sql =====

-- ============================================================
-- Hope Horizon Academy — Student Results Management Portal
-- Migration 0001: initial schema
-- ============================================================
-- Auth is handled by Supabase Auth (auth.users). This migration adds a
-- `public.users` profile table (1:1 with auth.users) plus every domain
-- table needed for the results workflow. Row Level Security (RLS) is
-- enabled on every table — see 0002_rls_policies.sql.

create extension if not exists "pgcrypto";

-- ---------- Enums ----------

create type user_role as enum (
  'ADMIN', 'TEACHER', 'STUDENT', 'PARENT', 'PRINCIPAL', 'VICE_PRINCIPAL', 'ACCOUNTANT', 'OTHER'
);

create type school_level as enum (
  'PRIMARY', 'SECONDARY', 'COLLEGE', 'UNIVERSITY', 'OTHER'
);

create type academic_structure_type as enum ('TERM', 'SEMESTER', 'OTHER');

create type result_status as enum (
  'DRAFT', 'SUBMITTED', 'PENDING_APPROVAL', 'APPROVED', 'PUBLISHED', 'HIDDEN'
);

-- IMPORTANT: only EMAIL, WHATSAPP, IN_APP are permitted. Do not add SMS or NONE.
create type notification_channel as enum ('EMAIL', 'WHATSAPP', 'IN_APP');

create type notification_status as enum ('PENDING', 'SENT', 'FAILED', 'READ');

create type notification_type as enum (
  'RESULT_PUBLISHED', 'RESULT_APPROVED', 'RESULT_SUBMITTED_FOR_APPROVAL', 'RESULT_HIDDEN',
  'ACCOUNT_CREATED', 'PASSWORD_RESET', 'SYSTEM_ANNOUNCEMENT', 'OTHER'
);

create type audit_action as enum (
  'LOGIN', 'LOGOUT', 'LOGIN_FAILED',
  'RESULT_CREATED', 'RESULT_EDITED', 'RESULT_SUBMITTED', 'RESULT_APPROVED',
  'RESULT_PUBLISHED', 'RESULT_HIDDEN', 'RESULT_DELETED',
  'STUDENT_CREATED', 'STUDENT_UPDATED', 'STUDENT_DELETED',
  'TEACHER_CREATED', 'TEACHER_UPDATED', 'TEACHER_DELETED',
  'USER_ROLE_CHANGED', 'PASSWORD_RESET_REQUESTED', 'PASSWORD_RESET_COMPLETED',
  'SYSTEM_SETTING_CHANGED', 'BULK_RESULT_UPLOAD'
);

-- ---------- Core tables ----------

create table public.schools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  levels school_level[] not null default '{OTHER}',
  logo_url text,
  contact_email text,
  contact_phone text,
  address text,
  website text,
  academic_structure_type academic_structure_type not null default 'TERM',
  academic_period_label text not null default 'Term',
  periods_per_session int not null default 3,
  current_academic_session_id uuid,
  current_term_id uuid,
  grading_scale jsonb not null default '[]', -- [{minScore,maxScore,grade,remark}]
  ca_max_score numeric not null default 40,
  exam_max_score numeric not null default 60,
  show_position_on_result boolean not null default true,
  show_average_on_result boolean not null default true,
  require_approval_before_publish boolean not null default true,
  enable_qr_verification boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Profile table, 1:1 with auth.users. id == auth.users.id.
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  name text not null,
  email text not null,
  phone text,
  whatsapp_number text,
  role user_role not null,
  is_active boolean not null default true,
  last_login_at timestamptz,
  must_change_password boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, email)
);

create table public.academic_sessions (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  name text not null,
  start_date date not null,
  end_date date not null,
  is_current boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, name),
  check (end_date > start_date)
);

create table public.terms (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  academic_session_id uuid not null references public.academic_sessions(id) on delete cascade,
  name text not null,
  structure_type academic_structure_type not null default 'TERM',
  "order" int not null,
  start_date date not null,
  end_date date not null,
  is_current boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (academic_session_id, "order"),
  check (end_date > start_date)
);

alter table public.schools
  add constraint schools_current_session_fk foreign key (current_academic_session_id) references public.academic_sessions(id),
  add constraint schools_current_term_fk foreign key (current_term_id) references public.terms(id);

create table public.classes (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  name text not null,
  level school_level not null,
  arm text,
  class_teacher_id uuid, -- fk added after teachers table exists
  "order" int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, name, arm)
);

create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  name text not null,
  code text not null,
  description text,
  ca_max_score_override numeric,
  exam_max_score_override numeric,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, code)
);

create table public.class_subjects (
  class_id uuid not null references public.classes(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  primary key (class_id, subject_id)
);

create table public.teachers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  full_name text not null,
  staff_id text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, staff_id),
  unique (school_id, user_id)
);

alter table public.classes
  add constraint classes_class_teacher_fk foreign key (class_teacher_id) references public.teachers(id);

create table public.teacher_classes (
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  primary key (teacher_id, class_id)
);

create table public.teacher_subject_assignments (
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  primary key (teacher_id, class_id, subject_id)
);

create table public.students (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  school_id uuid not null references public.schools(id) on delete cascade,
  full_name text not null,
  passport_url text,
  registration_number text,
  admission_number text not null,
  student_id text,
  class_id uuid not null references public.classes(id),
  gender text check (gender in ('MALE', 'FEMALE', 'OTHER')),
  date_of_birth date,
  current_academic_session_id uuid references public.academic_sessions(id),
  scratch_card_pin_hash text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, admission_number),
  unique (school_id, registration_number),
  unique (school_id, student_id)
);

create table public.parents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete cascade,
  full_name text not null,
  phone text,
  whatsapp_number text,
  email text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, user_id)
);

create table public.parent_students (
  parent_id uuid not null references public.parents(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  primary key (parent_id, student_id)
);

create table public.results (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  class_id uuid not null references public.classes(id),
  academic_session_id uuid not null references public.academic_sessions(id),
  term_id uuid not null references public.terms(id),
  overall_total numeric,
  overall_average numeric,
  overall_position int,
  attendance_present int,
  attendance_absent int,
  attendance_total_days int,
  teacher_remarks text,
  principal_remarks text,
  status result_status not null default 'DRAFT',
  entered_by uuid not null references public.users(id),
  submitted_by uuid references public.users(id),
  submitted_at timestamptz,
  approved_by uuid references public.users(id),
  approved_at timestamptz,
  published_by uuid references public.users(id),
  published_at timestamptz,
  hidden_by uuid references public.users(id),
  hidden_at timestamptz,
  rejection_reason text,
  qr_verification_code text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, academic_session_id, term_id)
);

create table public.result_subject_scores (
  id uuid primary key default gen_random_uuid(),
  result_id uuid not null references public.results(id) on delete cascade,
  subject_id uuid not null references public.subjects(id),
  ca numeric not null check (ca >= 0),
  exam numeric not null check (exam >= 0),
  total numeric not null check (total >= 0),
  grade text,
  remark text,
  subject_position int,
  unique (result_id, subject_id)
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  recipient_id uuid not null references public.users(id) on delete cascade,
  title text not null,
  message text not null,
  type notification_type not null default 'OTHER',
  channel notification_channel not null, -- EMAIL | WHATSAPP | IN_APP only — do not extend
  status notification_status not null default 'PENDING',
  read_at timestamptz,
  related_entity_type text,
  related_entity_id uuid,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  user_id uuid references public.users(id) on delete set null,
  action audit_action not null,
  entity_type text,
  entity_id uuid,
  metadata jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);

-- Password reset tokens are intentionally omitted: Supabase Auth's built-in
-- password recovery flow (auth.users + magic link/OTP) replaces this table.

-- ---------- Indexes ----------

create index on public.users (school_id, role);
create index on public.students (class_id);
create index on public.parent_students (student_id);
create index on public.teacher_subject_assignments (class_id, subject_id);
create index on public.results (class_id, academic_session_id, term_id, status);
create index on public.results (status);
create index on public.result_subject_scores (result_id);
create index on public.notifications (recipient_id, status, created_at desc);
create index on public.notifications (recipient_id, channel, read_at);
create index on public.audit_logs (school_id, created_at desc);
create index on public.audit_logs (user_id, created_at desc);
create index on public.audit_logs (entity_type, entity_id);

-- ---------- updated_at triggers ----------

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

do $$
declare
  t text;
begin
  for t in
    select unnest(array[
      'schools','users','academic_sessions','terms','classes','subjects',
      'teachers','students','parents','results','notifications'
    ])
  loop
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at();',
      t
    );
  end loop;
end $$;

-- ===== END 0001_init.sql =====


-- ===== BEGIN 0002_rls_policies.sql =====

-- ============================================================
-- Migration 0002: Row Level Security policies
-- ============================================================
-- Every table is scoped to the caller's school (multi-tenancy) and role.
-- Helper functions read the caller's row from public.users via auth.uid(),
-- so policies stay short and consistent across tables.

create or replace function public.current_user_school_id()
returns uuid
language sql stable
security definer
set search_path = public
as $$
  select school_id from public.users where id = auth.uid();
$$;

create or replace function public.current_user_role()
returns user_role
language sql stable
security definer
set search_path = public
as $$
  select role from public.users where id = auth.uid();
$$;

create or replace function public.is_staff()
returns boolean
language sql stable
security definer
set search_path = public
as $$
  select public.current_user_role() in ('ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL');
$$;

create or replace function public.can_approve_results()
returns boolean
language sql stable
security definer
set search_path = public
as $$
  select public.current_user_role() in ('ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL');
$$;

create or replace function public.current_teacher_id()
returns uuid
language sql stable
security definer
set search_path = public
as $$
  select id from public.teachers where user_id = auth.uid();
$$;

create or replace function public.current_student_id()
returns uuid
language sql stable
security definer
set search_path = public
as $$
  select id from public.students where user_id = auth.uid();
$$;

create or replace function public.current_parent_id()
returns uuid
language sql stable
security definer
set search_path = public
as $$
  select id from public.parents where user_id = auth.uid();
$$;

-- Enable RLS everywhere.
alter table public.schools enable row level security;
alter table public.users enable row level security;
alter table public.academic_sessions enable row level security;
alter table public.terms enable row level security;
alter table public.classes enable row level security;
alter table public.subjects enable row level security;
alter table public.class_subjects enable row level security;
alter table public.teachers enable row level security;
alter table public.teacher_classes enable row level security;
alter table public.teacher_subject_assignments enable row level security;
alter table public.students enable row level security;
alter table public.parents enable row level security;
alter table public.parent_students enable row level security;
alter table public.results enable row level security;
alter table public.result_subject_scores enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_logs enable row level security;

-- ---------- schools ----------
create policy "school members can read their own school"
  on public.schools for select
  using (id = public.current_user_school_id());

create policy "admins can update their own school"
  on public.schools for update
  using (id = public.current_user_school_id() and public.current_user_role() = 'ADMIN');

-- ---------- users ----------
create policy "users can read profiles in their own school"
  on public.users for select
  using (school_id = public.current_user_school_id());

create policy "users can update their own profile"
  on public.users for update
  using (id = auth.uid());

create policy "admins manage users in their school"
  on public.users for all
  using (school_id = public.current_user_school_id() and public.current_user_role() = 'ADMIN')
  with check (school_id = public.current_user_school_id() and public.current_user_role() = 'ADMIN');

-- ---------- academic_sessions / terms / classes / subjects (read: whole school; write: admin) ----------
create policy "school members can read sessions" on public.academic_sessions for select
  using (school_id = public.current_user_school_id());
create policy "admins manage sessions" on public.academic_sessions for all
  using (school_id = public.current_user_school_id() and public.current_user_role() = 'ADMIN')
  with check (school_id = public.current_user_school_id() and public.current_user_role() = 'ADMIN');

create policy "school members can read terms" on public.terms for select
  using (school_id = public.current_user_school_id());
create policy "admins manage terms" on public.terms for all
  using (school_id = public.current_user_school_id() and public.current_user_role() = 'ADMIN')
  with check (school_id = public.current_user_school_id() and public.current_user_role() = 'ADMIN');

create policy "school members can read classes" on public.classes for select
  using (school_id = public.current_user_school_id());
create policy "admins manage classes" on public.classes for all
  using (school_id = public.current_user_school_id() and public.current_user_role() = 'ADMIN')
  with check (school_id = public.current_user_school_id() and public.current_user_role() = 'ADMIN');

create policy "school members can read subjects" on public.subjects for select
  using (school_id = public.current_user_school_id());
create policy "admins manage subjects" on public.subjects for all
  using (school_id = public.current_user_school_id() and public.current_user_role() = 'ADMIN')
  with check (school_id = public.current_user_school_id() and public.current_user_role() = 'ADMIN');

create policy "school members can read class_subjects" on public.class_subjects for select
  using (exists (select 1 from public.classes c where c.id = class_id and c.school_id = public.current_user_school_id()));
create policy "admins manage class_subjects" on public.class_subjects for all
  using (exists (select 1 from public.classes c where c.id = class_id and c.school_id = public.current_user_school_id() and public.current_user_role() = 'ADMIN'));

-- ---------- teachers ----------
create policy "school members can read teachers" on public.teachers for select
  using (school_id = public.current_user_school_id());
create policy "admins manage teachers" on public.teachers for all
  using (school_id = public.current_user_school_id() and public.current_user_role() = 'ADMIN')
  with check (school_id = public.current_user_school_id() and public.current_user_role() = 'ADMIN');

create policy "school members can read teacher_classes" on public.teacher_classes for select
  using (exists (select 1 from public.teachers t where t.id = teacher_id and t.school_id = public.current_user_school_id()));
create policy "admins manage teacher_classes" on public.teacher_classes for all
  using (exists (select 1 from public.teachers t where t.id = teacher_id and t.school_id = public.current_user_school_id() and public.current_user_role() = 'ADMIN'));

create policy "school members can read teacher_subject_assignments" on public.teacher_subject_assignments for select
  using (exists (select 1 from public.teachers t where t.id = teacher_id and t.school_id = public.current_user_school_id()));
create policy "admins manage teacher_subject_assignments" on public.teacher_subject_assignments for all
  using (exists (select 1 from public.teachers t where t.id = teacher_id and t.school_id = public.current_user_school_id() and public.current_user_role() = 'ADMIN'));

-- ---------- students ----------
create policy "staff and teachers can read students in their school"
  on public.students for select
  using (
    school_id = public.current_user_school_id()
    and public.current_user_role() in ('ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL', 'TEACHER', 'ACCOUNTANT')
  );
create policy "students can read their own record"
  on public.students for select
  using (user_id = auth.uid());
create policy "parents can read their linked children"
  on public.students for select
  using (id in (select student_id from public.parent_students where parent_id = public.current_parent_id()));
create policy "admins manage students"
  on public.students for all
  using (school_id = public.current_user_school_id() and public.current_user_role() = 'ADMIN')
  with check (school_id = public.current_user_school_id() and public.current_user_role() = 'ADMIN');

-- ---------- parents ----------
create policy "staff can read parents in their school" on public.parents for select
  using (school_id = public.current_user_school_id() and public.current_user_role() in ('ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL'));
create policy "parents can read their own record" on public.parents for select
  using (user_id = auth.uid());
create policy "admins manage parents" on public.parents for all
  using (school_id = public.current_user_school_id() and public.current_user_role() = 'ADMIN')
  with check (school_id = public.current_user_school_id() and public.current_user_role() = 'ADMIN');

create policy "parents can read their own parent_students rows" on public.parent_students for select
  using (parent_id = public.current_parent_id());
create policy "admins manage parent_students" on public.parent_students for all
  using (exists (select 1 from public.parents p where p.id = parent_id and p.school_id = public.current_user_school_id() and public.current_user_role() = 'ADMIN'));

-- ---------- results ----------
create policy "staff can read all results in their school"
  on public.results for select
  using (school_id = public.current_user_school_id() and public.current_user_role() in ('ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL'));

create policy "teachers can read results they entered"
  on public.results for select
  using (entered_by = auth.uid());

create policy "students can read their own published results"
  on public.results for select
  using (student_id = public.current_student_id() and status = 'PUBLISHED');

create policy "parents can read published results of their linked children"
  on public.results for select
  using (
    status = 'PUBLISHED'
    and student_id in (select student_id from public.parent_students where parent_id = public.current_parent_id())
  );

create policy "teachers can insert draft results for their assigned classes"
  on public.results for insert
  with check (
    school_id = public.current_user_school_id()
    and entered_by = auth.uid()
    and (
      public.current_user_role() in ('ADMIN', 'PRINCIPAL', 'VICE_PRINCIPAL')
      or (
        public.current_user_role() = 'TEACHER'
        and (
          class_id in (select class_id from public.teacher_classes where teacher_id = public.current_teacher_id())
          or class_id in (select class_id from public.teacher_subject_assignments where teacher_id = public.current_teacher_id())
        )
      )
    )
  );

create policy "teachers can update their own draft results"
  on public.results for update
  using (entered_by = auth.uid() and status = 'DRAFT')
  with check (entered_by = auth.uid());

create policy "approvers can update results for workflow transitions"
  on public.results for update
  using (school_id = public.current_user_school_id() and public.can_approve_results())
  with check (school_id = public.current_user_school_id() and public.can_approve_results());

-- ---------- result_subject_scores (inherit access from the parent result) ----------
create policy "read scores if the parent result is readable"
  on public.result_subject_scores for select
  using (exists (select 1 from public.results r where r.id = result_id));

create policy "write scores if the caller can update the parent result"
  on public.result_subject_scores for all
  using (
    exists (
      select 1 from public.results r
      where r.id = result_id
        and (r.entered_by = auth.uid() or public.can_approve_results())
    )
  );

-- ---------- notifications ----------
create policy "users can read their own notifications"
  on public.notifications for select
  using (recipient_id = auth.uid());
create policy "users can mark their own notifications read"
  on public.notifications for update
  using (recipient_id = auth.uid())
  with check (recipient_id = auth.uid());
create policy "staff can insert notifications in their school"
  on public.notifications for insert
  with check (school_id = public.current_user_school_id());

-- ---------- audit_logs (write-only for normal users; admins can read) ----------
create policy "admins can read audit logs for their school"
  on public.audit_logs for select
  using (school_id = public.current_user_school_id() and public.current_user_role() = 'ADMIN');
create policy "any authenticated school member can write an audit entry"
  on public.audit_logs for insert
  with check (school_id = public.current_user_school_id());

-- ===== END 0002_rls_policies.sql =====


-- ===== BEGIN 0003_auth_sync_trigger.sql =====

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

-- ===== END 0003_auth_sync_trigger.sql =====


-- ===== BEGIN 0004_harden_account_provisioning.sql =====

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

-- ===== END 0004_harden_account_provisioning.sql =====


-- ===== BEGIN 0005_teacher_academic_workflows.sql =====

-- Hope Horizon: atomic teacher assignments, academic activation and read-only setup probe.
-- Apply after 0004. Both mutation functions validate the active ADMIN from auth.uid().
-- No caller-supplied school_id or role is trusted.

create or replace function public.hh_admin_replace_teacher_assignments(
  p_teacher_id uuid, p_class_ids uuid[], p_subject_assignments jsonb
) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_school uuid;
  v_role public.user_role;
  v_teacher_school uuid;
begin
  select u.school_id, u.role into v_school, v_role
    from public.users u where u.id = auth.uid() and u.is_active;
  if v_school is null or v_role is distinct from 'ADMIN'::public.user_role then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  select t.school_id into v_teacher_school from public.teachers t
    where t.id = p_teacher_id and t.is_active for update;
  if v_teacher_school is distinct from v_school then
    raise exception 'Teacher not found in this school' using errcode = '42501';
  end if;
  if p_class_ids is null or p_subject_assignments is null
     or jsonb_typeof(p_subject_assignments) is distinct from 'array' then
    raise exception 'Invalid assignments' using errcode = '22023';
  end if;

  -- A class-assignment and each subject assignment must refer to active,
  -- matching-school records; a subject must belong to its selected class.
  if exists (
    select 1 from unnest(p_class_ids) a(class_id)
    left join public.classes c on c.id = a.class_id
      and c.school_id = v_school and c.is_active
    where c.id is null
  ) then raise exception 'Invalid class assignment' using errcode = '22023'; end if;

  if exists (
    select 1 from jsonb_to_recordset(p_subject_assignments) as a("classId" uuid, "subjectId" uuid)
    left join public.classes c on c.id = a."classId" and c.school_id = v_school and c.is_active
    left join public.subjects s on s.id = a."subjectId" and s.school_id = v_school and s.is_active
    left join public.class_subjects cs on cs.class_id = c.id and cs.subject_id = s.id
    where c.id is null or s.id is null or cs.class_id is null
  ) then raise exception 'Subject is not assigned to the selected class' using errcode = '22023'; end if;

  delete from public.teacher_subject_assignments where teacher_id = p_teacher_id;
  delete from public.teacher_classes where teacher_id = p_teacher_id;

  insert into public.teacher_classes(teacher_id, class_id)
    select p_teacher_id, id from (select distinct unnest(p_class_ids) as id) c;

  insert into public.teacher_subject_assignments(teacher_id, class_id, subject_id)
    select distinct p_teacher_id, a."classId", a."subjectId"
    from jsonb_to_recordset(p_subject_assignments) as a("classId" uuid, "subjectId" uuid);

  return true;
end;
$$;
revoke all on function public.hh_admin_replace_teacher_assignments(uuid, uuid[], jsonb) from public, anon;
grant execute on function public.hh_admin_replace_teacher_assignments(uuid, uuid[], jsonb) to authenticated;

create or replace function public.hh_admin_activate_term(p_term_id uuid)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_school uuid;
  v_role public.user_role;
  v_session uuid;
begin
  select u.school_id, u.role into v_school, v_role
    from public.users u where u.id = auth.uid() and u.is_active;
  if v_school is null or v_role is distinct from 'ADMIN'::public.user_role then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  perform 1 from public.schools s where s.id = v_school and s.is_active for update;
  if not found then raise exception 'School not available' using errcode = '22023'; end if;

  select t.academic_session_id into v_session
    from public.terms t join public.academic_sessions a on a.id = t.academic_session_id
    where t.id = p_term_id and t.school_id = v_school and t.is_active
      and a.school_id = v_school and a.is_active;
  if v_session is null then
    raise exception 'Select an active term from an active school session' using errcode = '22023';
  end if;

  update public.terms set is_current = false
    where school_id = v_school and is_current;
  update public.academic_sessions set is_current = false
    where school_id = v_school and is_current;
  update public.academic_sessions set is_current = true
    where id = v_session and school_id = v_school;
  update public.terms set is_current = true
    where id = p_term_id and school_id = v_school;
  update public.schools
    set current_academic_session_id = v_session, current_term_id = p_term_id
    where id = v_school;
  return true;
end;
$$;
revoke all on function public.hh_admin_activate_term(uuid) from public, anon;
grant execute on function public.hh_admin_activate_term(uuid) to authenticated;

-- Diagnostic function does not modify data or reveal credentials.
-- It reports only whether required security safeguards were installed.
create or replace function public.hh_portal_capabilities()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_school uuid;
  v_role public.user_role;
begin
  select u.school_id, u.role into v_school, v_role
    from public.users u where u.id = auth.uid() and u.is_active;
  if v_school is null or v_role is distinct from 'ADMIN'::public.user_role then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'teacher_assignment_rpc', to_regprocedure('public.hh_admin_replace_teacher_assignments(uuid,uuid[],jsonb)') is not null,
    'academic_activation_rpc', to_regprocedure('public.hh_admin_activate_term(uuid)') is not null,
    'auth_trigger', exists (select 1 from pg_trigger where tgrelid = 'auth.users'::regclass and tgname = 'on_auth_user_created' and not tgisinternal),
    'authorization_guard', exists (select 1 from pg_trigger where tgrelid = 'public.users'::regclass and tgname = 'prevent_user_role_escalation' and not tgisinternal),
    'rls_teachers', (select relrowsecurity from pg_class where oid = 'public.teachers'::regclass),
    'rls_terms', (select relrowsecurity from pg_class where oid = 'public.terms'::regclass)
  );
end;
$$;
revoke all on function public.hh_portal_capabilities() from public, anon;
grant execute on function public.hh_portal_capabilities() to authenticated;

-- ===== END 0005_teacher_academic_workflows.sql =====


COMMIT;

-- Verification for an installation completed in this SQL session.
SELECT
  to_regclass('public.schools') IS NOT NULL AS schools_installed,
  to_regclass('public.users') IS NOT NULL AS profiles_installed,
  to_regclass('public.teachers') IS NOT NULL AS teachers_installed,
  to_regclass('public.academic_sessions') IS NOT NULL AS sessions_installed,
  to_regprocedure('public.hh_admin_replace_teacher_assignments(uuid,uuid[],jsonb)') IS NOT NULL AS teacher_assignments_ready,
  to_regprocedure('public.hh_admin_activate_term(uuid)') IS NOT NULL AS academic_activation_ready,
  to_regprocedure('public.hh_portal_capabilities()') IS NOT NULL AS integration_checks_ready;
