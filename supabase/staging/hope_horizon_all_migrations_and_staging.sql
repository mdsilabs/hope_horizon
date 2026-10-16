-- HOPE HORIZON ACADEMY - ONE-FILE STAGING INSTALLATION
-- Combined source migrations 0001-0013, followed by a staging-only QA fixture.
-- FOR A NEW, EMPTY, DEDICATED SUPABASE STAGING PROJECT ONLY.
-- NEVER RUN ON HOPE HORIZON PRODUCTION (iwfpdwihinhcwjgvmfei).
-- Existing installations must use incremental migrations instead.
-- This script intentionally fails closed unless the operator explicitly
-- uncomments the SET LOCAL statement below.

BEGIN;
-- REQUIRED ACTION for NEW, EMPTY STAGING DB only: uncomment next line.
-- SET LOCAL hh.qa_staging_confirm = 'I_CONFIRM_THIS_IS_AN_EMPTY_STAGING_PROJECT';

DO $qa_preflight$
BEGIN
  IF current_setting('hh.qa_staging_confirm', true) IS DISTINCT FROM
     'I_CONFIRM_THIS_IS_AN_EMPTY_STAGING_PROJECT' THEN
    RAISE EXCEPTION 'STAGING ONLY: uncomment the confirmation line after verifying a dedicated empty staging project';
  END IF;
  IF to_regclass('public.schools') IS NOT NULL
     OR to_regclass('public.users') IS NOT NULL
     OR to_regclass('public.results') IS NOT NULL THEN
    RAISE EXCEPTION 'Refusing to install: school tables already exist. Use incremental migrations, not a fresh-install bundle';
  END IF;
  IF EXISTS (SELECT 1 FROM auth.users LIMIT 1) THEN
    RAISE EXCEPTION 'Refusing to install into a project with existing authentication accounts';
  END IF;
END;
$qa_preflight$;


-- ======================================================================
-- SOURCE MIGRATION 0001_init.sql (verbatim except outer BEGIN/COMMIT)
-- ======================================================================
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


-- ======================================================================
-- SOURCE MIGRATION 0002_rls_policies.sql (verbatim except outer BEGIN/COMMIT)
-- ======================================================================
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


-- ======================================================================
-- SOURCE MIGRATION 0003_auth_sync_trigger.sql (verbatim except outer BEGIN/COMMIT)
-- ======================================================================
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


-- ======================================================================
-- SOURCE MIGRATION 0004_harden_account_provisioning.sql (verbatim except outer BEGIN/COMMIT)
-- ======================================================================
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


-- ======================================================================
-- SOURCE MIGRATION 0005_teacher_academic_workflows.sql (verbatim except outer BEGIN/COMMIT)
-- ======================================================================
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


-- ======================================================================
-- SOURCE MIGRATION 0006_family_account_integrity.sql (verbatim except outer BEGIN/COMMIT)
-- ======================================================================
-- Hope Horizon 0006: student/parent account integrity and atomic parent-child linking.
-- Apply once AFTER migrations 0001..0005. No demo data is inserted.
-- Transaction boundary handled by outer staging bundle.
-- Prevent one Auth user from claiming multiple unrelated student records.
create unique index if not exists hh_students_unique_auth_account
  on public.students(user_id) where user_id is not null;

create or replace function public.hh_check_student_auth_link()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.user_id is distinct from old.user_id and new.user_id is not null then
    if not exists (
      select 1 from public.users u where u.id = new.user_id
        and u.school_id = new.school_id and u.role = 'STUDENT'::public.user_role
        and u.is_active
    ) then
      raise exception 'Student account must be active, belong to this school, and have STUDENT role'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.hh_check_student_auth_link() from public, anon, authenticated;
drop trigger if exists hh_guard_student_auth_link on public.students;
create trigger hh_guard_student_auth_link
before update on public.students
for each row execute function public.hh_check_student_auth_link();

create or replace function public.hh_check_parent_student_link()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.parents p
    join public.students s on s.id = new.student_id
    where p.id = new.parent_id and p.school_id = s.school_id
  ) then
    raise exception 'Parent and student must belong to the same school'
      using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.hh_check_parent_student_link() from public, anon, authenticated;
drop trigger if exists hh_guard_parent_student_school on public.parent_students;
create trigger hh_guard_parent_student_school
before insert or update on public.parent_students
for each row execute function public.hh_check_parent_student_link();

-- One transaction: either all requested links are updated or none are.
create or replace function public.hh_admin_replace_parent_children(
  p_parent_id uuid, p_student_ids uuid[]
) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_school uuid;
  v_role public.user_role;
  v_parent_school uuid;
begin
  select u.school_id, u.role into v_school, v_role
  from public.users u where u.id = auth.uid() and u.is_active;
  if v_school is null or v_role is distinct from 'ADMIN'::public.user_role then
    raise exception 'School administrator required' using errcode = '42501';
  end if;
  select p.school_id into v_parent_school from public.parents p
    where p.id = p_parent_id and p.is_active for update;
  if v_parent_school is distinct from v_school then
    raise exception 'Parent does not belong to your school' using errcode = '42501';
  end if;
  if p_student_ids is null or coalesce(array_length(p_student_ids,1),0) not between 1 and 50
     or (select count(distinct value) from unnest(p_student_ids) as x(value))
         <> coalesce(array_length(p_student_ids,1),0)
     or exists (select 1 from unnest(p_student_ids) as x(value) where value is null) then
    raise exception 'Provide 1 to 50 distinct student identifiers' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(p_student_ids) as x(student_id)
    left join public.students s on s.id = x.student_id
      and s.school_id = v_school and s.is_active
    where s.id is null
  ) then
    raise exception 'Each child must be an active student in your school' using errcode = '22023';
  end if;
  delete from public.parent_students where parent_id = p_parent_id;
  insert into public.parent_students(parent_id, student_id)
    select p_parent_id, x.student_id from unnest(p_student_ids) as x(student_id);
  return true;
end;
$$;
revoke all on function public.hh_admin_replace_parent_children(uuid,uuid[]) from public, anon;
grant execute on function public.hh_admin_replace_parent_children(uuid,uuid[]) to authenticated;

-- Transaction boundary handled by outer staging bundle.


-- ======================================================================
-- SOURCE MIGRATION 0007_profile_cloudinary.sql (verbatim except outer BEGIN/COMMIT)
-- ======================================================================
-- Hope Horizon migration 0007: profile avatars and administrator Cloudinary settings
-- Apply after 0001–0006 on your chosen Supabase project.
-- Transaction boundary handled by outer staging bundle.
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
-- Authenticated Data API requests still require SQL privileges in addition to RLS.
grant select, insert, update on public.school_media_settings to authenticated;
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

-- Transaction boundary handled by outer staging bundle.


-- ======================================================================
-- SOURCE MIGRATION 0008_co_admin_roles.sql (verbatim except outer BEGIN/COMMIT)
-- ======================================================================
-- Hope Horizon migration 0008: equal-rights co-admins, immutable primary admins.
-- Run ONCE after 0007. Existing ADMIN accounts are preserved as PRIMARY.
-- CO_ADMIN is a designation: RLS and server role checks continue using ADMIN.
-- Transaction boundary handled by outer staging bundle.
alter table public.users add column if not exists admin_tier text;
update public.users set admin_tier = 'PRIMARY'
  where role = 'ADMIN'::public.user_role and admin_tier is null;

alter table public.users
  add constraint hh_user_admin_tier_matches_role check (
    (role = 'ADMIN'::public.user_role and admin_tier is not null and admin_tier in ('PRIMARY', 'CO_ADMIN'))
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
as $hh_school_id$
  select u.school_id from public.users u
  where u.id = (select auth.uid()) and u.is_active;
$hh_school_id$;
create or replace function public.current_user_role()
returns public.user_role language sql stable security definer set search_path = ''
as $hh_user_role$
  select u.role from public.users u
  where u.id = (select auth.uid()) and u.is_active;
$hh_user_role$;

-- Transaction boundary handled by outer staging bundle.
-- Check the existing administrators' designation:
-- select name,email,admin_tier,is_active from public.users where role='ADMIN';


-- ======================================================================
-- SOURCE MIGRATION 0009_subject_class_compilation.sql (verbatim except outer BEGIN/COMMIT)
-- ======================================================================
-- Hope Horizon 0009: transactional subject markbooks -> class compilation -> head approval
-- Apply after 0008. No existing result records are rewritten by this migration.
-- Transaction boundary handled by outer staging bundle.
create table public.subject_markbooks (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  class_id uuid not null references public.classes(id),
  subject_id uuid not null references public.subjects(id),
  student_id uuid not null references public.students(id),
  academic_session_id uuid not null references public.academic_sessions(id),
  term_id uuid not null references public.terms(id),
  teacher_id uuid not null references public.teachers(id),
  ca numeric not null check (ca>=0 and ca<=100),
  exam numeric not null check (exam>=0 and exam<=100),
  status text not null default 'DRAFT' check (status in ('DRAFT','SUBMITTED')),
  submitted_at timestamptz,
  updated_at timestamptz not null default now(),
  unique(student_id,subject_id,term_id)
);
create index on public.subject_markbooks (school_id,class_id,term_id,subject_id,status);
alter table public.subject_markbooks enable row level security;
grant select on public.subject_markbooks to authenticated;
create policy "assigned teachers and school heads read marks" on public.subject_markbooks
for select to authenticated
using (
  school_id = (select public.current_user_school_id())
  and (
    (select public.current_user_role()) in ('ADMIN','PRINCIPAL')
    or exists (select 1 from public.teachers t
      join public.teacher_subject_assignments ta on ta.teacher_id=t.id
      where t.user_id=(select auth.uid()) and t.is_active
        and ta.class_id=subject_markbooks.class_id and ta.subject_id=subject_markbooks.subject_id)
    or exists (select 1 from public.teachers t
      join public.teacher_classes tc on tc.teacher_id=t.id
      where t.user_id=(select auth.uid()) and t.is_active and tc.class_id=subject_markbooks.class_id)
  )
);

create table public.class_result_batches (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  class_id uuid not null references public.classes(id),
  academic_session_id uuid not null references public.academic_sessions(id),
  term_id uuid not null references public.terms(id),
  compiled_by uuid not null references public.users(id),
  status text not null default 'PENDING_APPROVAL'
    check (status in ('PENDING_APPROVAL','APPROVED','RETURNED')),
  submitted_at timestamptz not null default now(),
  decided_by uuid references public.users(id),
  decided_at timestamptz,
  decision_remarks text,
  unique (class_id,term_id)
);
create index on public.class_result_batches(school_id,status,submitted_at);
alter table public.class_result_batches enable row level security;
grant select on public.class_result_batches to authenticated;
create policy "authorized staff read class batches" on public.class_result_batches
for select to authenticated using (
  school_id=(select public.current_user_school_id())
  and (
    (select public.current_user_role()) in ('ADMIN','PRINCIPAL')
    or exists(select 1 from public.teachers t join public.teacher_classes tc
      on tc.teacher_id=t.id where t.user_id=(select auth.uid())
        and t.is_active and tc.class_id=class_result_batches.class_id)
  )
);

-- Prevent direct REST mutations of student term results. Service-role application
-- routes and restricted SECURITY DEFINER compilation functions still work.
-- Avoid bypassing the subject->class->head approval chain via legacy RLS writes.
revoke insert,update,delete on public.results from authenticated,anon;
revoke insert,update,delete on public.result_subject_scores from authenticated,anon;
drop policy if exists "teachers can insert draft results for their assigned classes" on public.results;
drop policy if exists "teachers can update their own draft results" on public.results;
drop policy if exists "write scores if the caller can update the parent result" on public.result_subject_scores;

-- No Data API insert/update grants on the new tables. All writes below use restricted RPCs.
create or replace function public.hh_save_subject_markbook(
  p_class_id uuid,p_subject_id uuid,p_term_id uuid,p_scores jsonb,p_submit boolean
) returns integer language plpgsql security definer set search_path=''
as $markbook$
declare
  v_school uuid; v_teacher uuid; v_session uuid; v_ca numeric; v_exam numeric;
  v_count integer; v_students integer; v_subject text; v_existing integer;
begin
  select u.school_id into v_school from public.users u
    where u.id=auth.uid() and u.is_active and u.role='TEACHER'::public.user_role;
  if v_school is null then raise exception 'Active teacher account required' using errcode='42501'; end if;

  select t.id into v_teacher from public.teachers t join public.teacher_subject_assignments a
    on a.teacher_id=t.id
    join public.classes c on c.id=a.class_id and c.school_id=t.school_id and c.is_active
    join public.subjects sub on sub.id=a.subject_id and sub.school_id=t.school_id and sub.is_active
    join public.class_subjects cs on cs.class_id=a.class_id and cs.subject_id=a.subject_id
    where t.user_id=auth.uid() and t.school_id=v_school and t.is_active
      and a.class_id=p_class_id and a.subject_id=p_subject_id;
  if v_teacher is null then
    raise exception 'Not assigned to this active class and subject' using errcode='42501';
  end if;
  select sch.current_academic_session_id into v_session from public.schools sch
    where sch.id=v_school and sch.current_term_id=p_term_id and sch.is_active;
  if v_session is null or not exists(select 1 from public.terms tr
    where tr.id=p_term_id and tr.school_id=v_school and tr.academic_session_id=v_session and tr.is_active)
  then raise exception 'Select the active school term' using errcode='22023'; end if;

  -- Serializes subject submission against class compilation using the class row.
  perform 1 from public.classes where id=p_class_id for update;
  if exists(select 1 from public.class_result_batches b where b.class_id=p_class_id
       and b.term_id=p_term_id and b.status<>'RETURNED') then
    raise exception 'The class was already submitted for head review' using errcode='22023';
  end if;
  if jsonb_typeof(p_scores) is distinct from 'array'
    or jsonb_array_length(p_scores)=0 or jsonb_array_length(p_scores)>250 then
    raise exception 'Provide 1 to 250 student scores' using errcode='22023';
  end if;
  select count(*) into v_students from public.students st
    where st.class_id=p_class_id and st.school_id=v_school and st.is_active;
  if v_students=0 then raise exception 'This class has no active students' using errcode='22023'; end if;

  -- Reject duplicates, missing pupils, out-of-school student IDs and invalid values.
  select count(*) into v_count from jsonb_to_recordset(p_scores)
    as item("studentId" uuid, ca numeric, exam numeric);
  if v_count<>v_students
    or (select count(distinct item."studentId") from jsonb_to_recordset(p_scores)
         as item("studentId" uuid, ca numeric, exam numeric))<>v_students
    or exists(select 1 from jsonb_to_recordset(p_scores)
        as item("studentId" uuid, ca numeric, exam numeric)
        left join public.students st on st.id=item."studentId" and st.class_id=p_class_id
          and st.school_id=v_school and st.is_active where st.id is null)
  then raise exception 'Submit exactly one row per active student' using errcode='22023'; end if;
  select coalesce(sub.ca_max_score_override,sch.ca_max_score),
         coalesce(sub.exam_max_score_override,sch.exam_max_score)
    into v_ca,v_exam
    from public.subjects sub cross join public.schools sch
    where sub.id=p_subject_id and sch.id=v_school;
  if exists(select 1 from jsonb_to_recordset(p_scores)
      as item("studentId" uuid, ca numeric, exam numeric)
      where item.ca is null or item.exam is null or item.ca<0 or item.exam<0
        or item.ca>v_ca or item.exam>v_exam)
  then raise exception 'Marks exceed the configured CA/exam limits or are missing' using errcode='22023'; end if;

  select count(*) into v_existing from public.subject_markbooks m
    where m.class_id=p_class_id and m.subject_id=p_subject_id
      and m.term_id=p_term_id and m.status='SUBMITTED';
  if v_existing>0 then raise exception 'Submitted subject scores are locked until returned by the head' using errcode='22023'; end if;

  insert into public.subject_markbooks(school_id,class_id,subject_id,student_id,
    academic_session_id,term_id,teacher_id,ca,exam,status,submitted_at)
  select v_school,p_class_id,p_subject_id,item."studentId",v_session,p_term_id,v_teacher,
         item.ca,item.exam,case when p_submit then 'SUBMITTED' else 'DRAFT' end,
         case when p_submit then now() else null end
    from jsonb_to_recordset(p_scores) as item("studentId" uuid, ca numeric, exam numeric)
  on conflict(student_id,subject_id,term_id) do update
    set ca=excluded.ca,exam=excluded.exam,teacher_id=excluded.teacher_id,
        status=excluded.status,submitted_at=excluded.submitted_at,updated_at=now()
    where subject_markbooks.school_id=excluded.school_id
      and subject_markbooks.class_id=excluded.class_id
      and subject_markbooks.academic_session_id=excluded.academic_session_id
      and subject_markbooks.status='DRAFT';
  get diagnostics v_existing = row_count;
  if v_existing<>v_count then
    raise exception 'Markbook was moved, submitted or changed by another teacher'
      using errcode='22023';
  end if;
  insert into public.audit_logs(school_id,user_id,action,entity_type,metadata)
    values(v_school,auth.uid(),
      case when p_submit then 'RESULT_SUBMITTED'::public.audit_action
        else 'RESULT_EDITED'::public.audit_action end,
      'subject_markbook',
      jsonb_build_object('classId',p_class_id,'subjectId',p_subject_id,'termId',p_term_id,
        'studentCount',v_count,'submitted',p_submit));
  return v_count;
end;
$markbook$;
revoke all on function public.hh_save_subject_markbook(uuid,uuid,uuid,jsonb,boolean) from public,anon;
grant execute on function public.hh_save_subject_markbook(uuid,uuid,uuid,jsonb,boolean) to authenticated;

create or replace function public.hh_compile_class_results(p_class_id uuid,p_term_id uuid)
returns integer language plpgsql security definer set search_path=''
as $compile$
declare
  v_school uuid; v_session uuid; v_students integer; v_subjects integer; v_existing text;
  v_count integer; v_scale jsonb;
begin
  select u.school_id into v_school from public.users u
    where u.id=auth.uid() and u.is_active and u.role='TEACHER'::public.user_role;
  if v_school is null then raise exception 'Active class teacher required' using errcode='42501'; end if;
  if not exists(select 1 from public.teachers t join public.teacher_classes tc on tc.teacher_id=t.id
    where t.user_id=auth.uid() and t.school_id=v_school and t.is_active and tc.class_id=p_class_id)
  then raise exception 'You are not assigned as a class teacher' using errcode='42501'; end if;
  select sch.current_academic_session_id,sch.grading_scale into v_session,v_scale
    from public.schools sch where sch.id=v_school and sch.current_term_id=p_term_id and sch.is_active;
  if v_session is null then raise exception 'The period is not current' using errcode='22023'; end if;
  perform 1 from public.classes c where c.id=p_class_id and c.school_id=v_school and c.is_active for update;
  if not found then raise exception 'Class is inactive' using errcode='22023'; end if;
  if jsonb_typeof(v_scale) is distinct from 'array' then
    raise exception 'Configure the school grading scale before compiling results' using errcode='22023';
  end if;
  if jsonb_array_length(v_scale)=0 then
    raise exception 'Configure at least one grading band before compilation' using errcode='22023';
  end if;
  select count(*) into v_students from public.students st where st.class_id=p_class_id and st.is_active;
  select count(*) into v_subjects from public.class_subjects cs join public.subjects sub
    on sub.id=cs.subject_id and sub.is_active where cs.class_id=p_class_id;
  if v_students=0 or v_subjects=0 then raise exception 'Class requires students and subjects' using errcode='22023'; end if;

  -- All active students must have SUBMITTED marks for EVERY active class subject.
  if exists(select 1 from public.students st cross join public.class_subjects cs
      join public.subjects sub on sub.id=cs.subject_id and sub.is_active
      left join public.subject_markbooks m
        on m.student_id=st.id and m.subject_id=cs.subject_id and m.term_id=p_term_id
         and m.class_id=p_class_id and m.status='SUBMITTED'
      where st.class_id=p_class_id and st.is_active and cs.class_id=p_class_id and m.id is null)
  then raise exception 'Some subject teachers have not submitted marks for all students' using errcode='22023'; end if;

  -- Never produce a published report card with an ungraded subject mark.
  if exists(select 1 from public.subject_markbooks m
    where m.class_id=p_class_id and m.term_id=p_term_id and m.status='SUBMITTED'
      and not exists(select 1 from jsonb_array_elements(v_scale) band
        where m.ca+m.exam between (band->>'minScore')::numeric
                            and (band->>'maxScore')::numeric))
  then raise exception 'The grading scale does not cover some entered totals' using errcode='22023'; end if;

  select b.status into v_existing from public.class_result_batches b
    where b.class_id=p_class_id and b.term_id=p_term_id for update;
  if v_existing is not null and v_existing<>'RETURNED' then
    raise exception 'Class compilation is already awaiting review or approved' using errcode='22023'; end if;
  if exists(select 1 from public.results r where r.class_id=p_class_id and r.term_id=p_term_id
      and r.status<>'DRAFT') then
    raise exception 'Existing finalized results block compilation' using errcode='22023'; end if;
  if v_existing is null and exists(select 1 from public.results r
        where r.class_id=p_class_id and r.term_id=p_term_id) then
    raise exception 'Legacy draft results exist; reconcile them before using class compilation'
      using errcode='22023';
  end if;
  if v_existing='RETURNED' then
    delete from public.results where school_id=v_school and class_id=p_class_id
      and term_id=p_term_id and status='DRAFT';
  end if;
  -- Every student's compiled result is produced in ONE database transaction.
  with compiled as (
    select m.student_id,sum(m.ca+m.exam) as total,
      round(avg(m.ca+m.exam),2) as average,
      rank() over (order by sum(m.ca+m.exam) desc) as position
    from public.subject_markbooks m
    where m.school_id=v_school and m.class_id=p_class_id and m.term_id=p_term_id
      and m.status='SUBMITTED'
    group by m.student_id
  )
  insert into public.results(school_id,class_id,student_id,academic_session_id,term_id,
      overall_total,overall_average,overall_position,status,entered_by,submitted_by,submitted_at)
  select v_school,p_class_id,c.student_id,v_session,p_term_id,c.total,c.average,c.position,
      'PENDING_APPROVAL'::public.result_status,auth.uid(),auth.uid(),now()
  from compiled c;

  insert into public.result_subject_scores(result_id,subject_id,ca,exam,total,grade)
  select r.id,m.subject_id,m.ca,m.exam,m.ca+m.exam,
    (select band->>'grade' from jsonb_array_elements(v_scale) band
      where m.ca+m.exam>=(band->>'minScore')::numeric
        and m.ca+m.exam<=(band->>'maxScore')::numeric limit 1)
  from public.results r join public.subject_markbooks m
    on m.student_id=r.student_id and m.class_id=r.class_id and m.term_id=r.term_id
  where r.school_id=v_school and r.class_id=p_class_id and r.term_id=p_term_id;

  insert into public.class_result_batches(school_id,class_id,academic_session_id,
      term_id,compiled_by,status,submitted_at,decided_by,decided_at,decision_remarks)
    values(v_school,p_class_id,v_session,p_term_id,auth.uid(),'PENDING_APPROVAL',now(),null,null,null)
  on conflict(class_id,term_id) do update
    set compiled_by=excluded.compiled_by,status='PENDING_APPROVAL',submitted_at=now(),
        decided_by=null,decided_at=null,decision_remarks=null;
  insert into public.audit_logs(school_id,user_id,action,entity_type,entity_id,metadata)
    values(v_school,auth.uid(),'RESULT_SUBMITTED','class_compilation',p_class_id,
      jsonb_build_object('termId',p_term_id,'studentCount',v_students,'subjectCount',v_subjects));
  return v_students;
end;
$compile$;
revoke all on function public.hh_compile_class_results(uuid,uuid) from public,anon;
grant execute on function public.hh_compile_class_results(uuid,uuid) to authenticated;

create or replace function public.hh_head_decide_class_batch(
  p_batch_id uuid,p_action text,p_remarks text
) returns boolean language plpgsql security definer set search_path=''
as $decide$
declare
  v_school uuid; v_role public.user_role; b public.class_result_batches%rowtype;
begin
  select u.school_id,u.role into v_school,v_role from public.users u
    where u.id=auth.uid() and u.is_active;
  if v_school is null or v_role not in ('PRINCIPAL','ADMIN') then
    raise exception 'Head of school approval required' using errcode='42501'; end if;
  if p_action not in ('APPROVE','RETURN') or length(coalesce(p_remarks,''))>500
    or (p_action='RETURN' and length(trim(coalesce(p_remarks,'')))=0) then
    raise exception 'Choose APPROVE or RETURN, and provide a reason when returning'
      using errcode='22023'; end if;
  select * into b from public.class_result_batches where id=p_batch_id and school_id=v_school for update;
  if not found or b.status<>'PENDING_APPROVAL' then
    raise exception 'No pending class compilation found' using errcode='22023'; end if;
  perform 1 from public.classes where id=b.class_id for update;
  if not exists(select 1 from public.results r where r.class_id=b.class_id and r.term_id=b.term_id)
    or exists(select 1 from public.results r where r.class_id=b.class_id and r.term_id=b.term_id
      and r.status<>'PENDING_APPROVAL') then
    raise exception 'The class compilation contains inconsistent result states' using errcode='22023';
  end if;
  if p_action='APPROVE' then
    update public.results set status='APPROVED',approved_by=auth.uid(),approved_at=now(),
      principal_remarks=nullif(trim(p_remarks),'')
      where school_id=v_school and class_id=b.class_id and term_id=b.term_id;
    update public.class_result_batches set status='APPROVED',decided_by=auth.uid(),
      decided_at=now(),decision_remarks=nullif(trim(p_remarks),'') where id=p_batch_id;
  else
    update public.results set status='DRAFT',rejection_reason=trim(p_remarks),
      submitted_by=null,submitted_at=null,approved_by=null,approved_at=null
      where school_id=v_school and class_id=b.class_id and term_id=b.term_id;
    update public.subject_markbooks set status='DRAFT',submitted_at=null,updated_at=now()
      where class_id=b.class_id and term_id=b.term_id;
    update public.class_result_batches set status='RETURNED',decided_by=auth.uid(),
      decided_at=now(),decision_remarks=trim(p_remarks) where id=p_batch_id;
  end if;
  insert into public.audit_logs(school_id,user_id,action,entity_type,entity_id,metadata)
    values(v_school,auth.uid(),
      case when p_action='APPROVE' then 'RESULT_APPROVED'::public.audit_action
        else 'RESULT_EDITED'::public.audit_action end,
      'class_result_batch',p_batch_id,
      jsonb_build_object('decision',p_action,'remarks',p_remarks));
  return true;
end;
$decide$;
revoke all on function public.hh_head_decide_class_batch(uuid,text,text) from public,anon;
grant execute on function public.hh_head_decide_class_batch(uuid,text,text) to authenticated;

-- Transaction boundary handled by outer staging bundle.


-- ======================================================================
-- SOURCE MIGRATION 0010_class_review_signoff.sql (verbatim except outer BEGIN/COMMIT)
-- ======================================================================
-- Hope Horizon migration 0010: class-teacher review matrix, corrections and sign-off.
-- Apply ONCE after 0009. Previous examination results remain untouched.
-- Transaction boundary handled by outer staging bundle.
create table public.class_subject_corrections (
 id uuid primary key default gen_random_uuid(),
 school_id uuid not null references public.schools(id) on delete cascade,
 class_id uuid not null references public.classes(id),
 subject_id uuid not null references public.subjects(id),
 term_id uuid not null references public.terms(id),
 reason text not null check(length(btrim(reason)) between 5 and 500),
 requested_by uuid not null references public.users(id),
 requested_at timestamptz not null default now(),
 resolved_by uuid references public.users(id),
 resolved_at timestamptz
);
create unique index hh_single_open_subject_correction
 on public.class_subject_corrections(class_id,subject_id,term_id)
 where resolved_at is null;
create index hh_subject_corrections_scope on public.class_subject_corrections(school_id,class_id,term_id);
alter table public.class_subject_corrections enable row level security;
grant select on public.class_subject_corrections to authenticated;
create policy "School staff see relevant subject correction requests"
on public.class_subject_corrections for select to authenticated
using (school_id=(select public.current_user_school_id()) and
 ((select public.current_user_role()) in ('ADMIN','PRINCIPAL')
  or exists (select 1 from public.teachers t join public.teacher_classes tc
    on tc.teacher_id=t.id where t.user_id=(select auth.uid()) and t.is_active
      and tc.class_id=class_subject_corrections.class_id)
  or exists (select 1 from public.teachers t join public.teacher_subject_assignments a
    on a.teacher_id=t.id where t.user_id=(select auth.uid()) and t.is_active
      and a.class_id=class_subject_corrections.class_id
      and a.subject_id=class_subject_corrections.subject_id)));

create table public.class_result_review_signoffs (
 class_id uuid not null references public.classes(id) on delete cascade,
 term_id uuid not null references public.terms(id),
 school_id uuid not null references public.schools(id) on delete cascade,
 reviewed_by uuid not null references public.users(id),
 reviewed_at timestamptz not null default now(),
 checked_rows int not null check(checked_rows>0),
 primary key(class_id,term_id)
);
alter table public.class_result_review_signoffs enable row level security;
grant select on public.class_result_review_signoffs to authenticated;
create policy "Class teachers and heads see review signoffs"
on public.class_result_review_signoffs for select to authenticated
using (school_id=(select public.current_user_school_id()) and
 ((select public.current_user_role()) in ('ADMIN','PRINCIPAL')
  or exists (select 1 from public.teachers t join public.teacher_classes tc
    on tc.teacher_id=t.id where t.user_id=(select auth.uid()) and t.is_active
      and tc.class_id=class_result_review_signoffs.class_id)));

-- Fail closed on changes: after any score modification the class must be checked again.
create or replace function public.hh_invalidate_class_review()
returns trigger language plpgsql security definer set search_path=''
as $invalidate$
begin
 delete from public.class_result_review_signoffs
 where class_id=coalesce(new.class_id,old.class_id) and term_id=coalesce(new.term_id,old.term_id);
 return coalesce(new,old);
end;
$invalidate$;
revoke all on function public.hh_invalidate_class_review() from public,anon,authenticated;
create trigger hh_marks_invalidate_class_review
 after insert or update or delete on public.subject_markbooks
 for each row execute function public.hh_invalidate_class_review();

-- Subject-specific return BEFORE whole-class compilation. One affected
-- subject is unlocked; all other submitted markbooks remain locked.
create or replace function public.hh_request_subject_correction(
 p_class_id uuid,p_subject_id uuid,p_term_id uuid,p_reason text
) returns uuid language plpgsql security definer set search_path=''
as $request$
declare v_school uuid; v_id uuid; v_changed integer;
begin
 select u.school_id into v_school from public.users u
  where u.id=auth.uid() and u.is_active and u.role='TEACHER'::public.user_role;
 if v_school is null or length(btrim(coalesce(p_reason,''))) not between 5 and 500
 then raise exception 'Class teacher and a correction reason of 5 to 500 characters required' using errcode='22023'; end if;
 if not exists(select 1 from public.teachers t join public.teacher_classes tc on tc.teacher_id=t.id
   where t.user_id=auth.uid() and t.school_id=v_school and t.is_active and tc.class_id=p_class_id)
 then raise exception 'Not the teacher of this class' using errcode='42501'; end if;
 perform 1 from public.classes c where c.id=p_class_id and c.school_id=v_school and c.is_active for update;
 if not found or not exists(select 1 from public.schools sch where sch.id=v_school and sch.current_term_id=p_term_id)
 then raise exception 'Choose your active class and term' using errcode='22023'; end if;
 if not exists(select 1 from public.class_subjects cs join public.subjects s on s.id=cs.subject_id
   where cs.class_id=p_class_id and cs.subject_id=p_subject_id and s.school_id=v_school and s.is_active)
 then raise exception 'Subject is not active in this class' using errcode='22023'; end if;
 if exists(select 1 from public.class_result_batches b where b.class_id=p_class_id and b.term_id=p_term_id
   and b.status in ('PENDING_APPROVAL','APPROVED'))
 then raise exception 'The class has already been sent to the head of school' using errcode='22023'; end if;
 if exists(select 1 from public.class_subject_corrections f where f.class_id=p_class_id
   and f.subject_id=p_subject_id and f.term_id=p_term_id and f.resolved_at is null)
 then raise exception 'There is already an open correction request for this subject' using errcode='22023'; end if;
 update public.subject_markbooks set status='DRAFT',submitted_at=null,updated_at=now()
 where school_id=v_school and class_id=p_class_id and subject_id=p_subject_id
   and term_id=p_term_id and status='SUBMITTED';
 get diagnostics v_changed=row_count;
 if v_changed=0 then raise exception 'No submitted subject marks to return' using errcode='22023'; end if;
 insert into public.class_subject_corrections(school_id,class_id,subject_id,term_id,reason,requested_by)
 values(v_school,p_class_id,p_subject_id,p_term_id,btrim(p_reason),auth.uid()) returning id into v_id;
 delete from public.class_result_review_signoffs where class_id=p_class_id and term_id=p_term_id;
 insert into public.audit_logs(school_id,user_id,action,entity_type,entity_id,metadata)
 values(v_school,auth.uid(),'RESULT_EDITED','class_subject_correction',v_id,
   jsonb_build_object('classId',p_class_id,'subjectId',p_subject_id,'termId',p_term_id,'operation','requested'));
 return v_id;
end;
$request$;
revoke all on function public.hh_request_subject_correction(uuid,uuid,uuid,text) from public,anon;
grant execute on function public.hh_request_subject_correction(uuid,uuid,uuid,text) to authenticated;

-- Only a class teacher can clear a request after the entire subject has
-- been resubmitted for every active pupil.
create or replace function public.hh_clear_subject_correction(p_request_id uuid)
returns boolean language plpgsql security definer set search_path=''
as $clear$
declare v_school uuid; f public.class_subject_corrections%rowtype; v_expected int; v_submitted int;
begin
 select u.school_id into v_school from public.users u
  where u.id=auth.uid() and u.is_active and u.role='TEACHER'::public.user_role;
 if v_school is null then raise exception 'Class teacher required' using errcode='42501'; end if;
 select * into f from public.class_subject_corrections
  where id=p_request_id and school_id=v_school and resolved_at is null for update;
 if not found then raise exception 'Open correction request not found' using errcode='22023'; end if;
 perform 1 from public.classes c where c.id=f.class_id and c.school_id=v_school for update;
 if not exists(select 1 from public.teachers t join public.teacher_classes tc on tc.teacher_id=t.id
    where t.user_id=auth.uid() and t.school_id=v_school and t.is_active and tc.class_id=f.class_id)
 then raise exception 'Only the class teacher may clear corrections' using errcode='42501'; end if;
 select count(*) into v_expected from public.students s where s.class_id=f.class_id
  and s.school_id=v_school and s.is_active;
 select count(*) into v_submitted from public.subject_markbooks m join public.students s on s.id=m.student_id
  where m.class_id=f.class_id and m.subject_id=f.subject_id and m.term_id=f.term_id
    and m.school_id=v_school and s.is_active and s.class_id=f.class_id and m.status='SUBMITTED';
 if v_expected=0 or v_submitted<>v_expected then
   raise exception 'Subject teacher must resubmit every active student before clearing' using errcode='22023'; end if;
 update public.class_subject_corrections set resolved_at=now(),resolved_by=auth.uid() where id=f.id;
 delete from public.class_result_review_signoffs where class_id=f.class_id and term_id=f.term_id;
 insert into public.audit_logs(school_id,user_id,action,entity_type,entity_id,metadata)
 values(v_school,auth.uid(),'RESULT_EDITED','class_subject_correction',f.id,
   jsonb_build_object('operation','cleared'));
 return true;
end;
$clear$;
revoke all on function public.hh_clear_subject_correction(uuid) from public,anon;
grant execute on function public.hh_clear_subject_correction(uuid) to authenticated;

create or replace function public.hh_signoff_class_review(p_class_id uuid,p_term_id uuid)
returns integer language plpgsql security definer set search_path=''
as $signoff$
declare v_school uuid; v_expected integer; v_submitted integer;
begin
 select u.school_id into v_school from public.users u
  where u.id=auth.uid() and u.is_active and u.role='TEACHER'::public.user_role;
 if v_school is null then raise exception 'Class teacher required' using errcode='42501'; end if;
 if not exists(select 1 from public.teachers t join public.teacher_classes tc on tc.teacher_id=t.id
  where t.user_id=auth.uid() and t.school_id=v_school and t.is_active and tc.class_id=p_class_id)
 then raise exception 'Not assigned to this class' using errcode='42501'; end if;
 perform 1 from public.classes c where c.id=p_class_id and c.school_id=v_school and c.is_active for update;
 if not found or not exists(select 1 from public.schools sch where sch.id=v_school and sch.current_term_id=p_term_id)
 then raise exception 'Active class and school term required' using errcode='22023'; end if;
 if exists(select 1 from public.class_result_batches b where b.class_id=p_class_id and b.term_id=p_term_id
   and b.status in ('APPROVED','PENDING_APPROVAL'))
 then raise exception 'Class is already submitted for approval' using errcode='22023'; end if;
 if exists(select 1 from public.class_subject_corrections f where f.class_id=p_class_id and f.term_id=p_term_id
  and f.resolved_at is null)
 then raise exception 'Clear all subject corrections before signing off' using errcode='22023'; end if;
 select (select count(*) from public.students st where st.school_id=v_school and st.class_id=p_class_id and st.is_active) *
        (select count(*) from public.class_subjects cs join public.subjects s on s.id=cs.subject_id
         where cs.class_id=p_class_id and s.school_id=v_school and s.is_active) into v_expected;
 select count(*) into v_submitted from public.subject_markbooks m
 join public.students st on st.id=m.student_id and st.is_active and st.class_id=p_class_id
 join public.class_subjects cs on cs.class_id=p_class_id and cs.subject_id=m.subject_id
 join public.subjects sub on sub.id=m.subject_id and sub.is_active
 where m.school_id=v_school and m.class_id=p_class_id and m.term_id=p_term_id and m.status='SUBMITTED';
 if v_expected=0 or v_submitted<>v_expected
 then raise exception 'All assigned subjects must be submitted for all active students' using errcode='22023'; end if;
 if exists(select 1 from public.subject_markbooks m
   where m.school_id=v_school and m.class_id=p_class_id and m.term_id=p_term_id
     and m.status='SUBMITTED' and
      (not exists(select 1 from public.students st where st.id=m.student_id
        and st.school_id=v_school and st.class_id=p_class_id and st.is_active)
       or not exists(select 1 from public.class_subjects cs join public.subjects sub on sub.id=cs.subject_id
        where cs.class_id=p_class_id and cs.subject_id=m.subject_id and sub.is_active)))
 then raise exception 'Outdated subject marks must be reconciled after class or subject changes' using errcode='22023'; end if;
 insert into public.class_result_review_signoffs(class_id,term_id,school_id,reviewed_by,reviewed_at,checked_rows)
 values(p_class_id,p_term_id,v_school,auth.uid(),now(),v_expected)
 on conflict(class_id,term_id) do update
  set reviewed_by=excluded.reviewed_by,reviewed_at=excluded.reviewed_at,checked_rows=excluded.checked_rows;
 insert into public.audit_logs(school_id,user_id,action,entity_type,entity_id,metadata)
 values(v_school,auth.uid(),'RESULT_EDITED','class_review',p_class_id,
  jsonb_build_object('operation','signed_off','termId',p_term_id,'scores',v_expected));
 return v_expected;
end;
$signoff$;
revoke all on function public.hh_signoff_class_review(uuid,uuid) from public,anon;
grant execute on function public.hh_signoff_class_review(uuid,uuid) to authenticated;

-- Completeness alone is no longer sufficient to compile. Enforce a fresh
-- sign-off INSIDE the class batch write transaction, even if caller skips UI.
create or replace function public.hh_guard_compilation_review()
returns trigger language plpgsql security definer set search_path=''
as $guard$
declare v_expected integer; v_count integer;
begin
 if new.status<>'PENDING_APPROVAL' then return new; end if;
 select (select count(*) from public.students st where st.school_id=new.school_id and st.class_id=new.class_id and st.is_active) *
        (select count(*) from public.class_subjects cs join public.subjects s on s.id=cs.subject_id
         where cs.class_id=new.class_id and s.is_active and s.school_id=new.school_id) into v_expected;
 select count(*) into v_count from public.subject_markbooks m join public.students st on st.id=m.student_id
   and st.is_active and st.class_id=new.class_id
   join public.class_subjects cs on cs.class_id=new.class_id and cs.subject_id=m.subject_id
   join public.subjects s on s.id=m.subject_id and s.is_active
   where m.school_id=new.school_id and m.class_id=new.class_id and m.term_id=new.term_id and m.status='SUBMITTED';
 if exists(select 1 from public.subject_markbooks m
  where m.school_id=new.school_id and m.class_id=new.class_id and m.term_id=new.term_id
    and m.status='SUBMITTED' and
     (not exists(select 1 from public.students st where st.id=m.student_id
        and st.school_id=new.school_id and st.class_id=new.class_id and st.is_active)
      or not exists(select 1 from public.class_subjects cs join public.subjects sub on sub.id=cs.subject_id
        where cs.class_id=new.class_id and cs.subject_id=m.subject_id and sub.is_active)))
 then raise exception 'Stale subject marks prevent class compilation'
   using errcode='22023'; end if;
 if v_expected=0 or v_count<>v_expected or not exists(
  select 1 from public.class_result_review_signoffs r
   where r.school_id=new.school_id and r.class_id=new.class_id and r.term_id=new.term_id
    and r.reviewed_by=new.compiled_by and r.checked_rows=v_expected
    and not exists(select 1 from public.subject_markbooks m where m.class_id=new.class_id
      and m.term_id=new.term_id and m.updated_at>r.reviewed_at))
 or exists(select 1 from public.class_subject_corrections f
   where f.class_id=new.class_id and f.term_id=new.term_id and f.resolved_at is null)
 then raise exception 'The class teacher must review and sign off all submitted marks first'
   using errcode='22023'; end if;
 return new;
end;
$guard$;
revoke all on function public.hh_guard_compilation_review() from public,anon,authenticated;
create trigger hh_require_review_before_compilation before insert or update on public.class_result_batches
 for each row execute function public.hh_guard_compilation_review();

-- Transaction boundary handled by outer staging bundle.


-- ======================================================================
-- SOURCE MIGRATION 0011_class_release_report_cards.sql (verbatim except outer BEGIN/COMMIT)
-- ======================================================================
-- Hope Horizon 0011: class-wide publication + report card attendance and signatures.
-- Install ONCE after migration 0010. Existing historical results are retained.
-- Transaction boundary handled by outer staging bundle.
create table public.class_report_entries (
 school_id uuid not null references public.schools(id) on delete cascade,
 class_id uuid not null references public.classes(id) on delete cascade,
 term_id uuid not null references public.terms(id) on delete cascade,
 student_id uuid not null references public.students(id) on delete cascade,
 attendance_present int not null check(attendance_present>=0 and attendance_present<=366),
 attendance_absent int not null check(attendance_absent>=0 and attendance_absent<=366),
 attendance_total_days int not null check(attendance_total_days between 1 and 366),
 teacher_remarks text not null check(length(btrim(teacher_remarks)) between 3 and 500),
 recorded_by uuid not null references public.users(id),
 updated_at timestamptz not null default now(),
 primary key(student_id,term_id),
 check(attendance_present+attendance_absent=attendance_total_days)
);
create index hh_class_report_entries_class_term on public.class_report_entries(school_id,class_id,term_id);
alter table public.class_report_entries enable row level security;
grant select on public.class_report_entries to authenticated;
create policy "Class teachers and heads read class report entries"
 on public.class_report_entries for select to authenticated
 using (school_id=(select public.current_user_school_id()) and
 ((select public.current_user_role()) in ('ADMIN','PRINCIPAL') or
  exists(select 1 from public.teachers t join public.teacher_classes tc on tc.teacher_id=t.id
   where t.user_id=(select auth.uid()) and t.is_active and tc.class_id=class_report_entries.class_id)));
-- Reuse migration 0010's sign-off invalidation trigger. It matches class_id+term_id.
create trigger hh_report_changes_invalidate_review after insert or update or delete on public.class_report_entries
 for each row execute function public.hh_invalidate_class_review();

alter table public.class_result_batches
 add column release_state text not null default 'UNRELEASED'
   check(release_state in ('UNRELEASED','PUBLISHED','WITHDRAWN','LEGACY_MIXED')),
 add column published_by uuid references public.users(id),
 add column published_at timestamptz,
 add column withdrawn_by uuid references public.users(id),
 add column withdrawn_at timestamptz,
 add column head_signature_name text,
 add column head_signed_at timestamptz;

-- Preserve pre-existing manual releases as legacy (possibly mixed) and force review,
-- rather than falsely claiming an entire historical class was bulk-published.
update public.class_result_batches b set release_state='LEGACY_MIXED'
 where exists(select 1 from public.results r where r.school_id=b.school_id
   and r.class_id=b.class_id and r.term_id=b.term_id and r.status in ('PUBLISHED','HIDDEN'));
update public.class_result_batches b
 set head_signature_name=u.name,head_signed_at=b.decided_at
 from public.users u where u.id=b.decided_by and b.status='APPROVED'
   and b.head_signature_name is null and b.decided_at is not null;

-- Released, head-approved class attribution is visible to a student or
-- linked parent ONLY for a published result they can already access.
create policy "Families see approval for own published class result"
 on public.class_result_batches for select to authenticated
 using (
  school_id=(select public.current_user_school_id()) and release_state='PUBLISHED'
  and exists(
   select 1 from public.results r
   where r.school_id=class_result_batches.school_id
    and r.class_id=class_result_batches.class_id
    and r.term_id=class_result_batches.term_id
    and r.status='PUBLISHED'::public.result_status
    and (
     ((select public.current_user_role())='STUDENT' and
       r.student_id=(select public.current_student_id()))
     or ((select public.current_user_role())='PARENT' and
       exists(select 1 from public.parent_students ps
        where ps.student_id=r.student_id and ps.parent_id=(select public.current_parent_id())))
    )
  )
 );

-- Snapshot the real approving user's display name and decision timestamp.
-- This is an electronic approval attribution, NOT a scanned or drawn signature.
create or replace function public.hh_stamp_head_approval()
returns trigger language plpgsql security definer set search_path=''
as $stamp$
begin
 if new.status='APPROVED' and old.status is distinct from new.status then
   select u.name into new.head_signature_name from public.users u
    where u.id=new.decided_by and u.school_id=new.school_id
      and u.is_active and u.role in ('ADMIN','PRINCIPAL');
   if new.head_signature_name is null or new.decided_at is null then
     raise exception 'Valid head-of-school approval identity and date required'
       using errcode='22023';
   end if;
   new.head_signed_at=new.decided_at;
 end if;
 return new;
end;
$stamp$;
revoke all on function public.hh_stamp_head_approval() from public,anon,authenticated;
create trigger hh_stamp_head_approval before update of status on public.class_result_batches
 for each row execute function public.hh_stamp_head_approval();

-- Require attendance and remarks for EVERY active student prior to review sign-off.
-- Only class teachers can write. One atomic save covers the entire active class roster.
create or replace function public.hh_save_class_report_entries(
 p_class_id uuid,p_term_id uuid,p_entries jsonb
) returns integer language plpgsql security definer set search_path=''
as $entries$
declare v_school uuid; v_expected integer; v_rows integer; v_written integer;
begin
 select u.school_id into v_school from public.users u
  where u.id=auth.uid() and u.is_active and u.role='TEACHER'::public.user_role;
 if v_school is null or not exists(select 1 from public.teachers t join public.teacher_classes tc
     on tc.teacher_id=t.id where t.user_id=auth.uid() and t.is_active
       and t.school_id=v_school and tc.class_id=p_class_id)
 then raise exception 'Only the assigned class teacher can save attendance'
   using errcode='42501'; end if;
 perform 1 from public.classes c where c.id=p_class_id and c.school_id=v_school and c.is_active for update;
 if not found or not exists(select 1 from public.schools sch where sch.id=v_school
   and sch.current_term_id=p_term_id and sch.is_active)
 then raise exception 'Active class and term required' using errcode='22023'; end if;
 if exists(select 1 from public.class_result_batches b where b.class_id=p_class_id
   and b.term_id=p_term_id and b.status in ('PENDING_APPROVAL','APPROVED'))
 then raise exception 'Class has already been sent for approval' using errcode='22023'; end if;
 if jsonb_typeof(p_entries) is distinct from 'array'
 then raise exception 'Provide all student attendance entries' using errcode='22023'; end if;
 select count(*) into v_expected from public.students s
  where s.school_id=v_school and s.class_id=p_class_id and s.is_active;
 select count(*) into v_rows from jsonb_to_recordset(p_entries)
  as e("studentId" uuid,present integer,absent integer,"totalDays" integer,remark text);
 if v_expected=0 or v_rows<>v_expected or v_rows>250
   or (select count(distinct e."studentId") from jsonb_to_recordset(p_entries)
     as e("studentId" uuid,present integer,absent integer,"totalDays" integer,remark text))<>v_expected
   or exists(select 1 from jsonb_to_recordset(p_entries)
     as e("studentId" uuid,present integer,absent integer,"totalDays" integer,remark text)
     left join public.students s on s.id=e."studentId" and s.school_id=v_school
       and s.class_id=p_class_id and s.is_active
     where s.id is null or e.present is null or e.absent is null or e."totalDays" is null
       or e.present<0 or e.absent<0 or e."totalDays" not between 1 and 366
       or e.present+e.absent<>e."totalDays"
       or length(btrim(coalesce(e.remark,''))) not between 3 and 500)
 then raise exception 'Attendance and remarks must be valid for every active student'
   using errcode='22023'; end if;
 insert into public.class_report_entries
  (school_id,class_id,term_id,student_id,attendance_present,attendance_absent,
   attendance_total_days,teacher_remarks,recorded_by)
 select v_school,p_class_id,p_term_id,e."studentId",e.present,e.absent,e."totalDays",
   btrim(e.remark),auth.uid()
 from jsonb_to_recordset(p_entries)
  as e("studentId" uuid,present integer,absent integer,"totalDays" integer,remark text)
 on conflict(student_id,term_id) do update
  set attendance_present=excluded.attendance_present,
      attendance_absent=excluded.attendance_absent,attendance_total_days=excluded.attendance_total_days,
      teacher_remarks=excluded.teacher_remarks,recorded_by=excluded.recorded_by,updated_at=now()
  where class_report_entries.school_id=excluded.school_id
    and class_report_entries.class_id=excluded.class_id;
 get diagnostics v_written=row_count;
 if v_written<>v_expected then raise exception 'An existing report entry has another class'
    using errcode='22023'; end if;
 insert into public.audit_logs(school_id,user_id,action,entity_type,entity_id,metadata)
 values(v_school,auth.uid(),'RESULT_EDITED','class_report_entries',p_class_id,
   jsonb_build_object('termId',p_term_id,'studentCount',v_expected));
 return v_expected;
end;
$entries$;
revoke all on function public.hh_save_class_report_entries(uuid,uuid,jsonb) from public,anon;
grant execute on function public.hh_save_class_report_entries(uuid,uuid,jsonb) to authenticated;

-- Sign-off requires attendance and remarks from every active pupil.
create or replace function public.hh_guard_report_signoff()
returns trigger language plpgsql security definer set search_path=''
as $signguard$
declare v_students integer;v_entries integer;
begin
 select count(*) into v_students from public.students st
  where st.school_id=new.school_id and st.class_id=new.class_id and st.is_active;
 select count(*) into v_entries from public.class_report_entries e
  join public.students st on st.id=e.student_id and st.is_active
    and st.school_id=new.school_id and st.class_id=new.class_id
  where e.school_id=new.school_id and e.class_id=new.class_id and e.term_id=new.term_id;
 if v_students=0 or v_entries<>v_students then
  raise exception 'Enter attendance and remarks for every pupil before signing off'
   using errcode='22023';end if;
 return new;
end;
$signguard$;
revoke all on function public.hh_guard_report_signoff() from public,anon,authenticated;
create trigger hh_guard_report_signoff before insert or update on public.class_result_review_signoffs
 for each row execute function public.hh_guard_report_signoff();

-- Before compilation: original migration 0010 checks score signoff.
-- Also refuse incomplete attendance/remarks in the very same DB transaction.
create or replace function public.hh_require_report_data_for_compilation()
returns trigger language plpgsql security definer set search_path=''
as $require$
declare v_expected integer;v_found integer;
begin
 if new.status<>'PENDING_APPROVAL' then return new;end if;
 select count(*) into v_expected from public.students s where s.school_id=new.school_id
  and s.class_id=new.class_id and s.is_active;
 select count(*) into v_found from public.class_report_entries e join public.students s
  on s.id=e.student_id and s.is_active and s.class_id=new.class_id
  where e.school_id=new.school_id and e.class_id=new.class_id and e.term_id=new.term_id;
 if v_expected=0 or v_found<>v_expected then
  raise exception 'Class attendance and teacher remarks are incomplete' using errcode='22023';end if;
 return new;
end;
$require$;
revoke all on function public.hh_require_report_data_for_compilation() from public,anon,authenticated;
create trigger hh_require_class_report_data before insert or update on public.class_result_batches
 for each row execute function public.hh_require_report_data_for_compilation();

-- The compiled result rows are created earlier in the same migration 0009
-- transaction. Copy reviewed attendance and remarks AFTER the batch is written.
create or replace function public.hh_copy_report_metadata()
returns trigger language plpgsql security definer set search_path=''
as $copy$
begin
 if new.status='PENDING_APPROVAL' then
  update public.results r set
   attendance_present=e.attendance_present,attendance_absent=e.attendance_absent,
   attendance_total_days=e.attendance_total_days,teacher_remarks=e.teacher_remarks
  from public.class_report_entries e
  where r.school_id=new.school_id and r.class_id=new.class_id and r.term_id=new.term_id
   and r.status='PENDING_APPROVAL' and e.school_id=r.school_id
   and e.class_id=r.class_id and e.term_id=r.term_id and e.student_id=r.student_id;
 end if;
 return new;
end;
$copy$;
revoke all on function public.hh_copy_report_metadata() from public,anon,authenticated;
create trigger hh_copy_report_metadata after insert or update on public.class_result_batches
 for each row execute function public.hh_copy_report_metadata();

-- A caller with a privileged service key must still use the whole-class
-- publishing transaction for a compiled result; old single-result APIs fail.
create or replace function public.hh_guard_compiled_result_release()
returns trigger language plpgsql security definer set search_path=''
as $protect$
declare v_batch uuid;
begin
 if new.status is distinct from old.status and
   new.status in ('PUBLISHED','HIDDEN') then
  select b.id into v_batch from public.class_result_batches b
   where b.class_id=new.class_id and b.term_id=new.term_id
     and b.school_id=new.school_id;
  if v_batch is not null and
   current_setting('hh.class_release_batch',true) is distinct from v_batch::text
  then raise exception 'Compiled results can only be released or withdrawn as a class'
    using errcode='42501';end if;
 end if;
 return new;
end;
$protect$;
revoke all on function public.hh_guard_compiled_result_release() from public,anon,authenticated;
create trigger hh_guard_compiled_result_release before update of status on public.results
 for each row execute function public.hh_guard_compiled_result_release();

create or replace function public.hh_release_class_batch(p_batch_id uuid,p_action text)
returns integer language plpgsql security definer set search_path=''
as $release$
declare v_school uuid;v_role public.user_role;b public.class_result_batches%rowtype;
 v_students integer;v_results integer;v_written integer;v_subjects integer;
begin
 select u.school_id,u.role into v_school,v_role from public.users u
  where u.id=auth.uid() and u.is_active;
 if v_school is null or v_role not in ('ADMIN','PRINCIPAL') then
  raise exception 'Only the school head or administrator may release a class'
    using errcode='42501';end if;
 if p_action not in ('PUBLISH','WITHDRAW') then
  raise exception 'Invalid publication action' using errcode='22023';end if;
 select * into b from public.class_result_batches where id=p_batch_id
  and school_id=v_school for update;
 if not found or b.status<>'APPROVED' then
  raise exception 'Entire class must have school-head approval first' using errcode='22023';end if;
 perform 1 from public.classes c where c.id=b.class_id and c.school_id=v_school for update;
 if p_action='PUBLISH' and b.release_state<>'UNRELEASED' then
  raise exception 'This class has already been released or has legacy mixed publication' using errcode='22023';end if;
 if p_action='WITHDRAW' and (v_role<>'ADMIN' or b.release_state<>'PUBLISHED') then
  raise exception 'Only the administrator can withdraw a published class' using errcode='42501';end if;
 select count(*) into v_students from public.students s where s.school_id=v_school
  and s.class_id=b.class_id and s.is_active;
 select count(*) into v_results from public.results r where r.school_id=v_school
  and r.class_id=b.class_id and r.term_id=b.term_id
  and r.status=case when p_action='PUBLISH' then 'APPROVED'::public.result_status
    else 'PUBLISHED'::public.result_status end
  and r.approved_by is not null and r.approved_at is not null
  and r.attendance_total_days is not null and r.teacher_remarks is not null;
 if v_students=0 or v_results<>v_students
  or exists(select 1 from public.results r where r.school_id=v_school
    and r.class_id=b.class_id and r.term_id=b.term_id
    and (not exists(select 1 from public.students s where s.id=r.student_id
      and s.is_active and s.class_id=b.class_id and s.school_id=v_school)
      or r.status<>case when p_action='PUBLISH' then 'APPROVED'::public.result_status
         else 'PUBLISHED'::public.result_status end))
 then raise exception 'Publication requires a complete class of approved results' using errcode='22023';end if;
 if b.head_signature_name is null or b.head_signed_at is null then
  raise exception 'A recorded school-head approval is required for release' using errcode='22023';end if;
 select count(*) into v_subjects from public.class_subjects cs join public.subjects sub
  on sub.id=cs.subject_id and sub.is_active where cs.class_id=b.class_id and sub.school_id=v_school;
 if v_subjects=0 or exists(select 1 from public.results r where r.school_id=v_school
   and r.class_id=b.class_id and r.term_id=b.term_id and
   (select count(*) from public.result_subject_scores rs where rs.result_id=r.id)<>v_subjects)
 then raise exception 'Class subject scores are incomplete' using errcode='22023';end if;
 perform set_config('hh.class_release_batch',b.id::text,true);
 if p_action='PUBLISH' then
  update public.results set status='PUBLISHED',published_by=auth.uid(),
   published_at=now(),hidden_by=null,hidden_at=null,
   qr_verification_code=coalesce(qr_verification_code,replace(gen_random_uuid()::text,'-',''))
  where school_id=v_school and class_id=b.class_id and term_id=b.term_id and status='APPROVED';
  get diagnostics v_written=row_count;
  if v_written<>v_students then raise exception 'Class changed during publication' using errcode='22023';end if;
  update public.class_result_batches set release_state='PUBLISHED',published_at=now(),
   published_by=auth.uid() where id=b.id;
 else
  update public.results set status='HIDDEN',hidden_by=auth.uid(),hidden_at=now()
   where school_id=v_school and class_id=b.class_id and term_id=b.term_id and status='PUBLISHED';
  get diagnostics v_written=row_count;
  if v_written<>v_students then raise exception 'Class changed during withdrawal' using errcode='22023';end if;
  update public.class_result_batches set release_state='WITHDRAWN',
   withdrawn_by=auth.uid(),withdrawn_at=now() where id=b.id;
 end if;
 perform set_config('hh.class_release_batch','',true);
 insert into public.audit_logs(school_id,user_id,action,entity_type,entity_id,metadata)
 values(v_school,auth.uid(),case when p_action='PUBLISH'
  then 'RESULT_PUBLISHED'::public.audit_action else 'RESULT_HIDDEN'::public.audit_action end,
  'class_result_batch',b.id,jsonb_build_object('action',p_action,'studentCount',v_students));
 -- IN_APP notifications are written transactionally; Gmail mass delivery
 -- is deliberately not sent inside this request.
 if p_action='PUBLISH' then
  insert into public.notifications(school_id,recipient_id,title,message,type,channel,status,
    related_entity_type,related_entity_id)
  select v_school,z.recipient_id,'Class results published',
    'Examination results are available in the student or parent portal.',
    'RESULT_PUBLISHED'::public.notification_type,'IN_APP'::public.notification_channel,
    'SENT'::public.notification_status,'class_result_batch',b.id
  from (
   select distinct st.user_id as recipient_id from public.students st
     where st.school_id=v_school and st.class_id=b.class_id and st.is_active and st.user_id is not null
   union
   select distinct pa.user_id as recipient_id from public.students st
     join public.parent_students ps on ps.student_id=st.id
     join public.parents pa on pa.id=ps.parent_id and pa.school_id=v_school and pa.is_active
     where st.school_id=v_school and st.class_id=b.class_id and st.is_active
  ) z join public.users u on u.id=z.recipient_id and u.school_id=v_school and u.is_active;
 end if;
 return v_written;
end;
$release$;
revoke all on function public.hh_release_class_batch(uuid,text) from public,anon;
grant execute on function public.hh_release_class_batch(uuid,text) to authenticated;

-- Transaction boundary handled by outer staging bundle.


-- ======================================================================
-- SOURCE MIGRATION 0012_onboarding_password_guard.sql (verbatim except outer BEGIN/COMMIT)
-- ======================================================================
-- Hope Horizon 0012: protect temporary credentials and restrict pending password changes.
-- Required to enforce password change at the DB/RLS layer.
-- Apply ONCE after migration 0011.
-- Transaction boundary handled by outer staging bundle.
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

-- Transaction boundary handled by outer staging bundle.


-- ======================================================================
-- SOURCE MIGRATION 0013_privileged_rpc_auth_guard.sql (verbatim except outer BEGIN/COMMIT)
-- ======================================================================
-- Migration 0013: SECURITY hardening only; no new app features.
-- Prevent pending password-setup accounts, inactive users and inactive schools
-- from invoking privileged SECURITY DEFINER RPCs directly over PostgREST.
-- Apply once AFTER migration 0012. Transactional and non-destructive.
-- Transaction boundary handled by outer staging bundle.
create or replace function public.hh_assert_active_setup()
returns void language plpgsql security definer set search_path=''
as $active$
begin
  if not exists (
    select 1 from public.users u
    join public.schools s on s.id=u.school_id
    where u.id=(select auth.uid()) and u.is_active
      and not u.must_change_password and s.is_active
  ) then
    raise exception 'Account must be active and password setup completed before school operations'
      using errcode='42501';
  end if;
end;
$active$;
revoke all on function public.hh_assert_active_setup() from public,anon,authenticated;

-- Protect personally identifying contact information: previously any
-- student or parent in the school could enumerate all users' email/phone.
-- Own-profile reads remain available through migration 0012's policy.
drop policy if exists "users can read profiles in their own school" on public.users;
create policy "school staff can read profiles in their own school"
on public.users for select to authenticated
using (
  school_id = (select public.current_user_school_id())
  and (select public.current_user_role()) in
    ('ADMIN','PRINCIPAL','VICE_PRINCIPAL','TEACHER','ACCOUNTANT')
);

-- Audit events must never claim to have been performed by a different user.
-- Staff workflow actions can still record genuine events as themselves;
-- regular users can write only their own login/logout records.
drop policy if exists "any authenticated school member can write an audit entry" on public.audit_logs;
create policy "authenticated users write only legitimate own audit events"
on public.audit_logs for insert to authenticated
with check (
  user_id = (select auth.uid())
  and school_id = (select public.current_user_school_id())
  and (
    action in ('LOGIN','LOGOUT','LOGIN_FAILED')
    or (select public.current_user_role()) in ('ADMIN','PRINCIPAL','VICE_PRINCIPAL')
  )
);

-- Each existing privileged RPC is renamed and made non-callable by users.
-- A same-signature guarded wrapper preserves every existing API and argument.

alter function public.hh_admin_replace_teacher_assignments(uuid,uuid[],jsonb) rename to hh_admin_replace_teacher_assignments_internal;
revoke all on function public.hh_admin_replace_teacher_assignments_internal(uuid,uuid[],jsonb) from public,anon,authenticated;
create function public.hh_admin_replace_teacher_assignments(p_teacher_id uuid, p_class_ids uuid[], p_subject_assignments jsonb)
returns boolean language plpgsql security definer set search_path=''
as $guard$
begin
  perform public.hh_assert_active_setup();
  return public.hh_admin_replace_teacher_assignments_internal(p_teacher_id, p_class_ids, p_subject_assignments);
end;
$guard$;
revoke all on function public.hh_admin_replace_teacher_assignments(uuid,uuid[],jsonb) from public,anon;
grant execute on function public.hh_admin_replace_teacher_assignments(uuid,uuid[],jsonb) to authenticated;

alter function public.hh_admin_activate_term(uuid) rename to hh_admin_activate_term_internal;
revoke all on function public.hh_admin_activate_term_internal(uuid) from public,anon,authenticated;
create function public.hh_admin_activate_term(p_term_id uuid)
returns boolean language plpgsql security definer set search_path=''
as $guard$
begin
  perform public.hh_assert_active_setup();
  return public.hh_admin_activate_term_internal(p_term_id);
end;
$guard$;
revoke all on function public.hh_admin_activate_term(uuid) from public,anon;
grant execute on function public.hh_admin_activate_term(uuid) to authenticated;

alter function public.hh_admin_replace_parent_children(uuid,uuid[]) rename to hh_admin_replace_parent_children_internal;
revoke all on function public.hh_admin_replace_parent_children_internal(uuid,uuid[]) from public,anon,authenticated;
create function public.hh_admin_replace_parent_children(p_parent_id uuid, p_student_ids uuid[])
returns boolean language plpgsql security definer set search_path=''
as $guard$
begin
  perform public.hh_assert_active_setup();
  return public.hh_admin_replace_parent_children_internal(p_parent_id, p_student_ids);
end;
$guard$;
revoke all on function public.hh_admin_replace_parent_children(uuid,uuid[]) from public,anon;
grant execute on function public.hh_admin_replace_parent_children(uuid,uuid[]) to authenticated;

alter function public.hh_save_subject_markbook(uuid,uuid,uuid,jsonb,boolean) rename to hh_save_subject_markbook_internal;
revoke all on function public.hh_save_subject_markbook_internal(uuid,uuid,uuid,jsonb,boolean) from public,anon,authenticated;
create function public.hh_save_subject_markbook(p_class_id uuid, p_subject_id uuid, p_term_id uuid, p_scores jsonb, p_submit boolean)
returns integer language plpgsql security definer set search_path=''
as $guard$
begin
  perform public.hh_assert_active_setup();
  return public.hh_save_subject_markbook_internal(p_class_id, p_subject_id, p_term_id, p_scores, p_submit);
end;
$guard$;
revoke all on function public.hh_save_subject_markbook(uuid,uuid,uuid,jsonb,boolean) from public,anon;
grant execute on function public.hh_save_subject_markbook(uuid,uuid,uuid,jsonb,boolean) to authenticated;

alter function public.hh_compile_class_results(uuid,uuid) rename to hh_compile_class_results_internal;
revoke all on function public.hh_compile_class_results_internal(uuid,uuid) from public,anon,authenticated;
create function public.hh_compile_class_results(p_class_id uuid, p_term_id uuid)
returns integer language plpgsql security definer set search_path=''
as $guard$
begin
  perform public.hh_assert_active_setup();
  return public.hh_compile_class_results_internal(p_class_id, p_term_id);
end;
$guard$;
revoke all on function public.hh_compile_class_results(uuid,uuid) from public,anon;
grant execute on function public.hh_compile_class_results(uuid,uuid) to authenticated;

alter function public.hh_head_decide_class_batch(uuid,text,text) rename to hh_head_decide_class_batch_internal;
revoke all on function public.hh_head_decide_class_batch_internal(uuid,text,text) from public,anon,authenticated;
create function public.hh_head_decide_class_batch(p_batch_id uuid, p_action text, p_remarks text)
returns boolean language plpgsql security definer set search_path=''
as $guard$
begin
  perform public.hh_assert_active_setup();
  return public.hh_head_decide_class_batch_internal(p_batch_id, p_action, p_remarks);
end;
$guard$;
revoke all on function public.hh_head_decide_class_batch(uuid,text,text) from public,anon;
grant execute on function public.hh_head_decide_class_batch(uuid,text,text) to authenticated;

alter function public.hh_request_subject_correction(uuid,uuid,uuid,text) rename to hh_request_subject_correction_internal;
revoke all on function public.hh_request_subject_correction_internal(uuid,uuid,uuid,text) from public,anon,authenticated;
create function public.hh_request_subject_correction(p_class_id uuid, p_subject_id uuid, p_term_id uuid, p_reason text)
returns uuid language plpgsql security definer set search_path=''
as $guard$
begin
  perform public.hh_assert_active_setup();
  return public.hh_request_subject_correction_internal(p_class_id, p_subject_id, p_term_id, p_reason);
end;
$guard$;
revoke all on function public.hh_request_subject_correction(uuid,uuid,uuid,text) from public,anon;
grant execute on function public.hh_request_subject_correction(uuid,uuid,uuid,text) to authenticated;

alter function public.hh_clear_subject_correction(uuid) rename to hh_clear_subject_correction_internal;
revoke all on function public.hh_clear_subject_correction_internal(uuid) from public,anon,authenticated;
create function public.hh_clear_subject_correction(p_request_id uuid)
returns boolean language plpgsql security definer set search_path=''
as $guard$
begin
  perform public.hh_assert_active_setup();
  return public.hh_clear_subject_correction_internal(p_request_id);
end;
$guard$;
revoke all on function public.hh_clear_subject_correction(uuid) from public,anon;
grant execute on function public.hh_clear_subject_correction(uuid) to authenticated;

alter function public.hh_signoff_class_review(uuid,uuid) rename to hh_signoff_class_review_internal;
revoke all on function public.hh_signoff_class_review_internal(uuid,uuid) from public,anon,authenticated;
create function public.hh_signoff_class_review(p_class_id uuid, p_term_id uuid)
returns integer language plpgsql security definer set search_path=''
as $guard$
begin
  perform public.hh_assert_active_setup();
  return public.hh_signoff_class_review_internal(p_class_id, p_term_id);
end;
$guard$;
revoke all on function public.hh_signoff_class_review(uuid,uuid) from public,anon;
grant execute on function public.hh_signoff_class_review(uuid,uuid) to authenticated;

alter function public.hh_save_class_report_entries(uuid,uuid,jsonb) rename to hh_save_class_report_entries_internal;
revoke all on function public.hh_save_class_report_entries_internal(uuid,uuid,jsonb) from public,anon,authenticated;
create function public.hh_save_class_report_entries(p_class_id uuid, p_term_id uuid, p_entries jsonb)
returns integer language plpgsql security definer set search_path=''
as $guard$
begin
  perform public.hh_assert_active_setup();
  return public.hh_save_class_report_entries_internal(p_class_id, p_term_id, p_entries);
end;
$guard$;
revoke all on function public.hh_save_class_report_entries(uuid,uuid,jsonb) from public,anon;
grant execute on function public.hh_save_class_report_entries(uuid,uuid,jsonb) to authenticated;

alter function public.hh_release_class_batch(uuid,text) rename to hh_release_class_batch_internal;
revoke all on function public.hh_release_class_batch_internal(uuid,text) from public,anon,authenticated;
create function public.hh_release_class_batch(p_batch_id uuid, p_action text)
returns integer language plpgsql security definer set search_path=''
as $guard$
begin
  perform public.hh_assert_active_setup();
  return public.hh_release_class_batch_internal(p_batch_id, p_action);
end;
$guard$;
revoke all on function public.hh_release_class_batch(uuid,text) from public,anon;
grant execute on function public.hh_release_class_batch(uuid,text) to authenticated;

-- Refresh PostgREST's RPC catalogue after renaming and re-registering all
-- privileged function signatures. The notification is sent on COMMIT.
notify pgrst, 'reload schema';

-- Transaction boundary handled by outer staging bundle.


-- ======================================================================
-- STAGING ACADEMIC FIXTURE (schools/session/term/class/5 subjects)
-- ======================================================================
-- Staging ONLY: Hope Horizon result-workflow QA fixture.
-- Run after migrations 0001-0013 in a dedicated, empty staging Supabase project.
-- Never apply to the production school. Auth accounts are provisioned separately.
-- Transaction boundary handled by outer staging bundle.
do $$
declare
  v_school uuid; v_session uuid; v_term uuid; v_class uuid;
  v_subject uuid;
  v_codes text[] := array['MAT','ENG','BSC','SOC','ICT'];
  v_names text[] := array['Mathematics','English Language','Basic Science','Social Studies','Computer Studies'];
  i integer;
begin
  if exists(select 1 from public.schools where name <> 'Hope Horizon QA STAGING') then
    raise exception 'Refusing to seed: non-staging school exists in this database';
  end if;
  if exists(select 1 from public.schools where name='Hope Horizon QA STAGING') then
    raise exception 'QA fixture already installed: do not reapply';
  end if;
  insert into public.schools(name,levels,academic_structure_type,academic_period_label,
    periods_per_session,ca_max_score,exam_max_score,grading_scale)
  values ('Hope Horizon QA STAGING',array['SECONDARY']::public.school_level[],'TERM','Term',
    3,40,60,'[{"minScore":70,"maxScore":100,"grade":"A","remark":"Excellent"},{"minScore":60,"maxScore":69.99,"grade":"B","remark":"Very Good"},{"minScore":50,"maxScore":59.99,"grade":"C","remark":"Good"},{"minScore":45,"maxScore":49.99,"grade":"D","remark":"Pass"},{"minScore":0,"maxScore":44.99,"grade":"F","remark":"Fail"}]'::jsonb)
  returning id into v_school;

  insert into public.academic_sessions(school_id,name,start_date,end_date,is_current)
    values(v_school,'2026/2027','2026-09-01','2027-07-31',true)
    returning id into v_session;
  insert into public.terms(school_id,academic_session_id,name,structure_type,"order",start_date,end_date,is_current)
    values(v_school,v_session,'First Term','TERM',1,'2026-09-01','2026-12-18',true)
    returning id into v_term;
  update public.schools set current_academic_session_id=v_session,current_term_id=v_term
    where id=v_school;
  insert into public.classes(school_id,name,level,arm,"order")
    values(v_school,'JSS 1 QA','SECONDARY','QA',1) returning id into v_class;

  for i in 1..5 loop
    insert into public.subjects(school_id,name,code)
      values(v_school,v_names[i],v_codes[i]) returning id into v_subject;
    insert into public.class_subjects(class_id,subject_id) values(v_class,v_subject);
  end loop;
end $$;
-- Transaction boundary handled by outer staging bundle.

-- Populate ten *unlinked* QA student academic records. Authentication
-- accounts, teacher and parent accounts cannot be securely provisioned by
-- raw SQL. Use scripts/seed-results-staging.ts after this installation.
INSERT INTO public.students
  (school_id, class_id, current_academic_session_id,
   full_name, admission_number, registration_number, gender)
SELECT sch.id, cls.id, sess.id,
  'QA Student ' || lpad(n::text, 2, '0'),
  'QA/2026/' || lpad(n::text, 2, '0'),
  'QA-REG-' || lpad(n::text, 2, '0'),
  CASE WHEN n % 2 = 1 THEN 'FEMALE' ELSE 'MALE' END
FROM public.schools sch
JOIN public.classes cls ON cls.school_id = sch.id AND cls.name = 'JSS 1 QA'
JOIN public.academic_sessions sess ON sess.school_id = sch.id AND sess.name = '2026/2027'
CROSS JOIN generate_series(1,10) AS seq(n)
WHERE sch.name = 'Hope Horizon QA STAGING';

DO $qa_verify$
DECLARE v_school uuid; v_class uuid;
BEGIN
  SELECT id INTO STRICT v_school FROM public.schools
    WHERE name = 'Hope Horizon QA STAGING';
  SELECT id INTO STRICT v_class FROM public.classes
    WHERE school_id = v_school AND name = 'JSS 1 QA';
  IF (SELECT count(*) FROM public.subjects WHERE school_id=v_school) <> 5
     OR (SELECT count(*) FROM public.students WHERE school_id=v_school AND class_id=v_class) <> 10
     OR (SELECT count(*) FROM public.class_subjects WHERE class_id=v_class) <> 5
  THEN
    RAISE EXCEPTION 'QA fixture incomplete: require exactly five subjects and ten students';
  END IF;
END;
$qa_verify$;

COMMIT;
-- END OF SINGLE STAGING BUNDLE.
-- NEXT: create authenticated QA users safely via server-side Admin API,
-- using STAGING_TEST_PASSWORD, then run scripts/verify-results-staging.ts.
