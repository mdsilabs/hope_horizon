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
