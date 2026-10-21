-- 0020 · Preserve EVERY school ADMIN profile/Auth login in operational resets.
-- Applies after 0019, without resetting or pausing the school.
-- The original PRIMARY stays Super Admin; CO_ADMIN accounts remain intact.
-- A partially completed legacy reset needs manual DBA investigation before
-- upgrade: profiles already deleted by older code cannot be inferred safely.
BEGIN;
DO $check$
BEGIN
  IF EXISTS(SELECT 1 FROM public.platform_reset_jobs
            WHERE status='AUTH_CLEANUP_PENDING') THEN
    RAISE EXCEPTION 'Unfinished legacy reset cleanup found. Stop: reconcile old Auth queue and restore administrator accounts before applying 0020'
      USING ERRCODE='55000';
  END IF;
END;
$check$;

CREATE OR REPLACE FUNCTION public.hh_platform_reset_counts(p_school uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $counts$
SELECT pg_catalog.jsonb_build_object(
  'users', (SELECT count(*) FROM public.users u
    WHERE u.school_id=p_school AND u.role<>'ADMIN'::public.user_role),
  'academic_sessions', (SELECT count(*) FROM public.academic_sessions x WHERE x.school_id=p_school),
  'terms', (SELECT count(*) FROM public.terms x WHERE x.school_id=p_school),
  'classes', (SELECT count(*) FROM public.classes x WHERE x.school_id=p_school),
  'subjects', (SELECT count(*) FROM public.subjects x WHERE x.school_id=p_school),
  'teachers', (SELECT count(*) FROM public.teachers x WHERE x.school_id=p_school),
  'students', (SELECT count(*) FROM public.students x WHERE x.school_id=p_school),
  'parents', (SELECT count(*) FROM public.parents x WHERE x.school_id=p_school),
  'results', (SELECT count(*) FROM public.results x WHERE x.school_id=p_school),
  'notifications', (SELECT count(*) FROM public.notifications x WHERE x.school_id=p_school),
  'subject_markbooks', (SELECT count(*) FROM public.subject_markbooks x WHERE x.school_id=p_school),
  'class_result_batches', (SELECT count(*) FROM public.class_result_batches x WHERE x.school_id=p_school),
  'class_subject_corrections', (SELECT count(*) FROM public.class_subject_corrections x WHERE x.school_id=p_school),
  'class_result_review_signoffs', (SELECT count(*) FROM public.class_result_review_signoffs x WHERE x.school_id=p_school),
  'class_report_entries', (SELECT count(*) FROM public.class_report_entries x WHERE x.school_id=p_school),
  'hh_irregularity_requests', (SELECT count(*) FROM public.hh_irregularity_requests x WHERE x.school_id=p_school),
  'hh_irregularity_events', (SELECT count(*) FROM public.hh_irregularity_events x WHERE x.school_id=p_school),
  'result_subject_scores', (SELECT count(*) FROM public.result_subject_scores x
    JOIN public.results r ON r.id=x.result_id WHERE r.school_id=p_school),
  'parent_students', (SELECT count(*) FROM public.parent_students x
    JOIN public.parents p ON p.id=x.parent_id WHERE p.school_id=p_school),
  'teacher_classes', (SELECT count(*) FROM public.teacher_classes x
    JOIN public.teachers t ON t.id=x.teacher_id WHERE t.school_id=p_school),
  'teacher_subject_assignments', (SELECT count(*) FROM public.teacher_subject_assignments x
    JOIN public.teachers t ON t.id=x.teacher_id WHERE t.school_id=p_school),
  'class_subjects', (SELECT count(*) FROM public.class_subjects x
    JOIN public.classes c ON c.id=x.class_id WHERE c.school_id=p_school)
);
$counts$;

CREATE OR REPLACE FUNCTION public.hh_platform_reset_operational(
 p_school uuid,p_actor uuid,p_expected jsonb,p_confirmation text,p_backup_reference text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $reset$
DECLARE
 v_school_name text;
 v_now jsonb;
 v_job uuid;
 v_auth_ids uuid[];
 v_after jsonb;
 v_owner_count integer;
 v_admin_ids uuid[];
 v_admin_ids_after uuid[];
BEGIN
 IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
   RAISE EXCEPTION 'Service-role-only maintenance operation' USING ERRCODE='42501';
 END IF;
 IF p_school IS NULL OR p_actor IS NULL OR
    p_expected IS NULL OR pg_catalog.jsonb_typeof(p_expected)<>'object' OR
    length(btrim(coalesce(p_backup_reference,''))) NOT BETWEEN 12 AND 200 THEN
   RAISE EXCEPTION 'Reset requires explicit school, owner, live counts and backup reference' USING ERRCODE='22023';
 END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_school::text),839019);
 SELECT s.name INTO v_school_name FROM public.schools s
 WHERE s.id=p_school AND s.is_active FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Active school not found' USING ERRCODE='42501'; END IF;
 SELECT count(*) INTO v_owner_count FROM public.users u
 WHERE u.school_id=p_school AND u.role='ADMIN'::public.user_role
   AND u.admin_tier='PRIMARY' AND u.is_active AND NOT u.must_change_password;
 IF v_owner_count<>1 OR NOT EXISTS(SELECT 1 FROM public.users u
   WHERE u.id=p_actor AND u.school_id=p_school
     AND u.role='ADMIN'::public.user_role AND u.admin_tier='PRIMARY'
     AND u.is_active AND NOT u.must_change_password) THEN
    RAISE EXCEPTION 'Original PRIMARY administrator identity cannot be verified uniquely'
      USING ERRCODE='42501';
 END IF;
 IF (SELECT c.paused FROM public.platform_installation_controls c WHERE c.id=1) IS DISTINCT FROM true THEN
   RAISE EXCEPTION 'Pause the installation before reset' USING ERRCODE='55000';
 END IF;
 IF p_confirmation IS DISTINCT FROM ('RESET OPERATIONAL DATA FOR '||v_school_name) THEN
   RAISE EXCEPTION 'School reset confirmation does not match' USING ERRCODE='22023';
 END IF;
 IF EXISTS(SELECT 1 FROM public.platform_reset_jobs j
    WHERE j.school_id=p_school AND j.status<>'COMPLETED') THEN
    RAISE EXCEPTION 'Complete the existing authentication cleanup job before another reset'
      USING ERRCODE='55000';
 END IF;
 PERFORM public.hh_platform_reset_schema_guard();
 v_now:=public.hh_platform_reset_counts(p_school);
 IF v_now<>p_expected THEN
   RAISE EXCEPTION 'Operational data changed since preview. Restart reset preview'
      USING ERRCODE='55000';
 END IF;

 -- Protect every current ADMIN, including inactive/pending CO_ADMIN.
 -- Snapshot admin IDs under the same locked transaction.
 SELECT COALESCE(array_agg(u.id ORDER BY u.id),'{}'::uuid[])
 INTO v_admin_ids FROM public.users u
 WHERE u.school_id=p_school AND u.role='ADMIN'::public.user_role;
 SELECT COALESCE(array_agg(u.id ORDER BY u.id),'{}'::uuid[])
 INTO v_auth_ids FROM public.users u
 WHERE u.school_id=p_school AND u.role<>'ADMIN'::public.user_role;
 IF cardinality(v_auth_ids)>100000 THEN
   RAISE EXCEPTION 'Too many Auth accounts for reset job. Use supervised migration.'
     USING ERRCODE='55000';
 END IF;

 INSERT INTO public.platform_reset_jobs(
   school_id,primary_admin_id,pending_auth_ids,initial_account_count,
   verified_preview,backup_reference,status
 ) VALUES(p_school,p_actor,v_auth_ids,cardinality(v_auth_ids),v_now,p_backup_reference,
   CASE WHEN cardinality(v_auth_ids)=0 THEN 'COMPLETED' ELSE 'AUTH_CLEANUP_PENDING' END
 ) RETURNING id INTO v_job;

 -- Remove operational dependencies before their parent rows. The entire
 -- database mutation is one Postgres transaction. No TRUNCATE, CASCADE or
 -- deletion of other schools, branding or audit records is permitted.
 DELETE FROM public.hh_irregularity_events x WHERE x.school_id=p_school;
 DELETE FROM public.hh_irregularity_requests x WHERE x.school_id=p_school;
 DELETE FROM public.result_subject_scores x USING public.results r
   WHERE x.result_id=r.id AND r.school_id=p_school;
 DELETE FROM public.class_report_entries x WHERE x.school_id=p_school;
 DELETE FROM public.class_subject_corrections x WHERE x.school_id=p_school;
 DELETE FROM public.class_result_review_signoffs x WHERE x.school_id=p_school;
 DELETE FROM public.subject_markbooks x WHERE x.school_id=p_school;
 DELETE FROM public.class_result_batches x WHERE x.school_id=p_school;
 DELETE FROM public.results x WHERE x.school_id=p_school;
 DELETE FROM public.notifications x WHERE x.school_id=p_school;
 DELETE FROM public.parent_students x USING public.parents p
   WHERE x.parent_id=p.id AND p.school_id=p_school;
 DELETE FROM public.students x WHERE x.school_id=p_school;
 DELETE FROM public.parents x WHERE x.school_id=p_school;
 DELETE FROM public.teacher_subject_assignments x USING public.teachers t
   WHERE x.teacher_id=t.id AND t.school_id=p_school;
 DELETE FROM public.teacher_classes x USING public.teachers t
   WHERE x.teacher_id=t.id AND t.school_id=p_school;
 DELETE FROM public.class_subjects x USING public.classes c
   WHERE x.class_id=c.id AND c.school_id=p_school;
 DELETE FROM public.classes x WHERE x.school_id=p_school;
 DELETE FROM public.subjects x WHERE x.school_id=p_school;
 DELETE FROM public.teachers x WHERE x.school_id=p_school;
 -- Clear dangling active period pointers while retaining school settings.
 UPDATE public.schools SET current_academic_session_id=NULL,current_term_id=NULL
   WHERE id=p_school;
 DELETE FROM public.terms x WHERE x.school_id=p_school;
 DELETE FROM public.academic_sessions x WHERE x.school_id=p_school;
 UPDATE public.platform_installation_controls SET updated_by=p_actor WHERE id=1;
 DELETE FROM public.users x WHERE x.school_id=p_school AND x.role<>'ADMIN'::public.user_role;

 v_after:=public.hh_platform_reset_counts(p_school);
 SELECT COALESCE(array_agg(u.id ORDER BY u.id),'{}'::uuid[])
 INTO v_admin_ids_after FROM public.users u
 WHERE u.school_id=p_school AND u.role='ADMIN'::public.user_role;
 IF v_admin_ids_after IS DISTINCT FROM v_admin_ids THEN
    RAISE EXCEPTION 'An administrator profile changed during reset; rolled back' USING ERRCODE='55000';
 END IF;
 IF EXISTS(SELECT 1 FROM pg_catalog.jsonb_each_text(v_after) AS v(key,value)
      WHERE v.value::bigint<>0) OR
    NOT EXISTS(SELECT 1 FROM public.users WHERE id=p_actor AND school_id=p_school
      AND role='ADMIN'::public.user_role AND admin_tier='PRIMARY') OR
    NOT EXISTS(SELECT 1 FROM public.schools WHERE id=p_school AND is_active) THEN
     RAISE EXCEPTION 'Post-reset verification failed. Entire database transaction rolled back'
       USING ERRCODE='55000';
 END IF;
 IF cardinality(v_auth_ids)=0 THEN
   UPDATE public.platform_reset_jobs SET completed_at=now() WHERE id=v_job;
 END IF;
 INSERT INTO public.audit_logs(
   school_id,user_id,action,entity_type,entity_id,metadata
 ) VALUES(p_school,p_actor,'SYSTEM_SETTING_CHANGED'::public.audit_action,
   'operational_school_reset',v_job,
   pg_catalog.jsonb_build_object(
     'operation','operational_reset_database_phase',
     'removed_counts',v_now,'auth_accounts_pending',cardinality(v_auth_ids),
     'backup_reference',p_backup_reference,
     'preserved_admin_accounts',cardinality(v_admin_ids)
   ));
 RETURN v_job;
END;
$reset$;

-- A version handshake makes the web reset endpoint fail closed if 0020 has
-- not been applied to this database. This function has no write side effects.
CREATE OR REPLACE FUNCTION public.hh_platform_reset_policy_version()
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $version$
SELECT 2::integer;
$version$;
REVOKE ALL ON FUNCTION public.hh_platform_reset_policy_version() FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.hh_platform_reset_policy_version() TO service_role;
REVOKE ALL ON FUNCTION public.hh_platform_reset_counts(uuid) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.hh_platform_reset_counts(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.hh_platform_reset_operational(uuid,uuid,jsonb,text,text) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.hh_platform_reset_operational(uuid,uuid,jsonb,text,text) TO service_role;

NOTIFY pgrst,'reload schema';
COMMIT;
