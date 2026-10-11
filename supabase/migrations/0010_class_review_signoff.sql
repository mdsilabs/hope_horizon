-- Hope Horizon migration 0010: class-teacher review matrix, corrections and sign-off.
-- Apply ONCE after 0009. Previous examination results remain untouched.
begin;

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

commit;
