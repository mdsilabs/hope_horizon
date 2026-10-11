-- Hope Horizon 0011: class-wide publication + report card attendance and signatures.
-- Install ONCE after migration 0010. Existing historical results are retained.
begin;

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
   qr_verification_code=coalesce(qr_verification_code,encode(gen_random_bytes(16),'hex'))
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

commit;
