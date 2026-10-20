-- 0019 · Original PRIMARY administrator as immutable Super Admin.
-- Operational data only. School settings, branding, PRIMARY admin, audit history
-- and platform control records remain. Requires migration 0018.
-- This migration DOES NOT delete data or pause the portal by itself.
BEGIN;

DO $check$
BEGIN
  IF EXISTS(
    SELECT school_id FROM public.users
    WHERE role='ADMIN'::public.user_role AND admin_tier='PRIMARY'
    GROUP BY school_id HAVING count(*)<>1
  ) THEN
    RAISE EXCEPTION 'Ambiguous PRIMARY administrators exist. Resolve using documented DBA recovery before enabling destructive controls'
      USING ERRCODE='23514';
  END IF;
END;
$check$;
CREATE UNIQUE INDEX IF NOT EXISTS hh_one_primary_admin_per_school
  ON public.users(school_id)
  WHERE role='ADMIN'::public.user_role AND admin_tier='PRIMARY';

CREATE TABLE IF NOT EXISTS public.platform_reset_jobs(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id),
  primary_admin_id uuid NOT NULL REFERENCES public.users(id),
  status text NOT NULL DEFAULT 'AUTH_CLEANUP_PENDING'
    CHECK(status IN('AUTH_CLEANUP_PENDING','COMPLETED')),
  pending_auth_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  initial_account_count integer NOT NULL DEFAULT 0,
  verified_preview jsonb NOT NULL,
  backup_reference text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CHECK(cardinality(pending_auth_ids)<=100000)
);
CREATE INDEX IF NOT EXISTS hh_reset_job_school_created
  ON public.platform_reset_jobs(school_id,created_at DESC);
ALTER TABLE public.platform_reset_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_reset_jobs FROM anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.platform_reset_jobs TO service_role;

-- All mutable school operational tables supported by 0001-0019 are listed;
-- fail closed on future unknown tables rather than leaving hidden leftovers.
CREATE OR REPLACE FUNCTION public.hh_platform_reset_schema_guard()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $schema$
DECLARE v_unexpected text;
BEGIN
  SELECT string_agg(c.relname,', ' ORDER BY c.relname) INTO v_unexpected
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind='r' AND NOT c.relispartition
    AND c.relname <> ALL(ARRAY[
      'schools','users','academic_sessions','terms','classes','subjects',
      'class_subjects','teachers','teacher_classes','teacher_subject_assignments',
      'students','parents','parent_students','results','result_subject_scores',
      'notifications','audit_logs','school_media_settings','subject_markbooks',
      'class_result_batches','class_subject_corrections',
      'class_result_review_signoffs','class_report_entries',
      'hh_irregularity_requests','hh_irregularity_events',
      'platform_installation_controls','platform_reset_jobs'
    ]);
  IF v_unexpected IS NOT NULL THEN
    RAISE EXCEPTION 'Unknown public tables exist: %. Operational reset aborted for schema review',v_unexpected
      USING ERRCODE='55000';
  END IF;
END;
$schema$;

CREATE OR REPLACE FUNCTION public.hh_platform_reset_counts(p_school uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $counts$
SELECT pg_catalog.jsonb_build_object(
  'users', (SELECT count(*) FROM public.users u
    WHERE u.school_id=p_school AND NOT (u.role='ADMIN'::public.user_role AND u.admin_tier='PRIMARY')),
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

 SELECT COALESCE(array_agg(id ORDER BY id),'{}'::uuid[]) INTO v_auth_ids
 FROM public.users WHERE school_id=p_school AND id<>p_actor;
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
 DELETE FROM public.users x WHERE x.school_id=p_school AND x.id<>p_actor;

 v_after:=public.hh_platform_reset_counts(p_school);
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
     'backup_reference',p_backup_reference
   ));
 RETURN v_job;
END;
$reset$;

CREATE OR REPLACE FUNCTION public.hh_platform_reset_auth_done(p_job uuid,p_user uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $authdone$
DECLARE v_remain int;
BEGIN
 IF (SELECT auth.role()) IS DISTINCT FROM 'service_role' THEN
   RAISE EXCEPTION 'Service role required' USING ERRCODE='42501';
 END IF;
 UPDATE public.platform_reset_jobs
   SET pending_auth_ids=array_remove(pending_auth_ids,p_user)
 WHERE id=p_job AND p_user=ANY(pending_auth_ids) AND status='AUTH_CLEANUP_PENDING';
 IF NOT FOUND THEN RAISE EXCEPTION 'User is not awaiting cleanup in this job' USING ERRCODE='22023'; END IF;
 SELECT cardinality(pending_auth_ids) INTO v_remain FROM public.platform_reset_jobs WHERE id=p_job FOR UPDATE;
 IF v_remain=0 THEN
   UPDATE public.platform_reset_jobs SET status='COMPLETED',completed_at=now() WHERE id=p_job;
 END IF;
 RETURN pg_catalog.jsonb_build_object('remaining',v_remain);
END;
$authdone$;

REVOKE ALL ON FUNCTION public.hh_platform_reset_schema_guard() FROM public,anon,authenticated;
REVOKE ALL ON FUNCTION public.hh_platform_reset_counts(uuid) FROM public,anon,authenticated;
REVOKE ALL ON FUNCTION public.hh_platform_reset_operational(uuid,uuid,jsonb,text,text) FROM public,anon,authenticated;
REVOKE ALL ON FUNCTION public.hh_platform_reset_auth_done(uuid,uuid) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.hh_platform_reset_counts(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.hh_platform_reset_operational(uuid,uuid,jsonb,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.hh_platform_reset_auth_done(uuid,uuid) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
