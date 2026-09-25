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
