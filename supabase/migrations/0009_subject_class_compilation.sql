-- Hope Horizon 0009: transactional subject markbooks -> class compilation -> head approval
-- Apply after 0008. No existing result records are rewritten by this migration.
begin;

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

commit;
