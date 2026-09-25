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
