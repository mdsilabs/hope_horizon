-- Migration 0013: SECURITY hardening only; no new app features.
-- Prevent pending password-setup accounts, inactive users and inactive schools
-- from invoking privileged SECURITY DEFINER RPCs directly over PostgREST.
-- Apply once AFTER migration 0012. Transactional and non-destructive.
begin;

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

commit;
