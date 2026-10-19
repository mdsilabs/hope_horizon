-- Hope Horizon Academy · CURRENT ACADEMIC TERM RESULTS CLEANUP
-- DANGEROUS WRITE. REVIEW THE PREVIEW AND TAKE A VERIFIED DATABASE BACKUP FIRST.
-- Only the explicitly selected school/current term is touched.
-- Keeps schools, sessions, terms, classes, subjects, students, teachers,
-- assignments, parents, user accounts, other terms, and audit_logs intact.
--
-- How to use in Supabase SQL Editor:
-- 1) Run preview_current_term_results_cleanup.sql first.
-- 2) Replace BOTH NULL::uuid constants below with the school_id and term_id
--    copied from the preview. NEVER run with placeholders.
-- 3) Set the confirmation string exactly as shown below (it defaults to
--    disabled). Confirm you want even PUBLISHED results for this term erased.
-- 4) Run the whole script ONCE. Any failure rolls back the transaction.
--
-- This does not remove identity, academic structure or immutable audit logs.
-- Old audit logs may still refer to erased result IDs, by design.

BEGIN;
SET LOCAL lock_timeout='8s';
SET LOCAL statement_timeout='90s';

DO $cleanup$
DECLARE
  v_school uuid := NULL::uuid; -- REPLACE with preview school_id e.g. '...uuid...'::uuid
  v_term uuid := NULL::uuid;   -- REPLACE with preview term_id
  v_confirm text := 'NOT_CONFIRMED'; -- REPLACE with 'DELETE_CURRENT_TERM_RESULTS'
  v_term_now uuid;
  v_session uuid;
  v_notification_count bigint;
  v_score_count bigint;
  v_result_count bigint;
  v_mark_count bigint;
  v_signoff_count bigint;
  v_correction_count bigint;
  v_entries_count bigint;
  v_batch_count bigint;
BEGIN
  IF v_school IS NULL OR v_term IS NULL
     OR v_confirm <> 'DELETE_CURRENT_TERM_RESULTS' THEN
    RAISE EXCEPTION 'Not confirmed: specify school, term and explicit confirmation';
  END IF;

  -- Lock current school's row. Abort if an admin switches the current term.
  SELECT s.current_term_id,s.current_academic_session_id
  INTO v_term_now,v_session
  FROM public.schools s
  WHERE s.id=v_school AND s.is_active
  FOR UPDATE;
  IF NOT FOUND OR v_term_now IS DISTINCT FROM v_term
      OR v_session IS NULL THEN
    RAISE EXCEPTION 'School/current academic term changed or is inactive. Abort.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.terms t
    WHERE t.id=v_term AND t.school_id=v_school
      AND t.academic_session_id=v_session
  ) THEN
    RAISE EXCEPTION 'Selected term is not the school current term/session. Abort.';
  END IF;

  -- Restrict downstream deletion to this school's selected term only.
  -- Notifications are only removed when explicitly linked to these batches
  -- or results; unrelated school notifications remain untouched.
  DELETE FROM public.notifications n
  WHERE n.school_id=v_school
    AND (
      (n.related_entity_type='class_result_batch'
       AND EXISTS(SELECT 1 FROM public.class_result_batches b
         WHERE b.id=n.related_entity_id AND b.school_id=v_school AND b.term_id=v_term))
      OR
      (n.related_entity_type='result'
       AND EXISTS(SELECT 1 FROM public.results r
         WHERE r.id=n.related_entity_id AND r.school_id=v_school AND r.term_id=v_term))
    );
  GET DIAGNOSTICS v_notification_count=ROW_COUNT;

  -- Explicitly delete score details before result headers; never touch
  -- class/subject definitions or teacher/student identity records.
  DELETE FROM public.result_subject_scores ss
  USING public.results r
  WHERE ss.result_id=r.id AND r.school_id=v_school AND r.term_id=v_term;
  GET DIAGNOSTICS v_score_count=ROW_COUNT;

  -- Preserve audit_logs. Clear per-term review/attendance/corrections first,
  -- then delete markbooks (whose invalidation trigger may revisit signoffs).
  DELETE FROM public.class_result_review_signoffs
  WHERE school_id=v_school AND term_id=v_term;
  GET DIAGNOSTICS v_signoff_count=ROW_COUNT;

  DELETE FROM public.class_subject_corrections
  WHERE school_id=v_school AND term_id=v_term;
  GET DIAGNOSTICS v_correction_count=ROW_COUNT;

  DELETE FROM public.class_report_entries
  WHERE school_id=v_school AND term_id=v_term;
  GET DIAGNOSTICS v_entries_count=ROW_COUNT;

  DELETE FROM public.subject_markbooks
  WHERE school_id=v_school AND term_id=v_term;
  GET DIAGNOSTICS v_mark_count=ROW_COUNT;

  DELETE FROM public.results
  WHERE school_id=v_school AND term_id=v_term;
  GET DIAGNOSTICS v_result_count=ROW_COUNT;

  DELETE FROM public.class_result_batches
  WHERE school_id=v_school AND term_id=v_term;
  GET DIAGNOSTICS v_batch_count=ROW_COUNT;

  -- Verify nothing from this term's result-workflow tables remains.
  IF EXISTS(SELECT 1 FROM public.subject_markbooks
              WHERE school_id=v_school AND term_id=v_term)
    OR EXISTS(SELECT 1 FROM public.results
              WHERE school_id=v_school AND term_id=v_term)
    OR EXISTS(SELECT 1 FROM public.class_result_batches
              WHERE school_id=v_school AND term_id=v_term)
    OR EXISTS(SELECT 1 FROM public.class_result_review_signoffs
              WHERE school_id=v_school AND term_id=v_term)
    OR EXISTS(SELECT 1 FROM public.class_subject_corrections
              WHERE school_id=v_school AND term_id=v_term)
    OR EXISTS(SELECT 1 FROM public.class_report_entries
              WHERE school_id=v_school AND term_id=v_term)
    OR EXISTS(SELECT 1 FROM public.result_subject_scores ss
       JOIN public.results r ON r.id=ss.result_id
       WHERE r.school_id=v_school AND r.term_id=v_term)
  THEN
    RAISE EXCEPTION 'Verification failed: cleanup rolled back';
  END IF;
  RAISE NOTICE 'Current term % school % cleaned. Results %, subject scores %, markbooks %, batches %, signoffs %, corrections %, attendance/remarks %, related notifications %.',
    v_term,v_school,v_result_count,v_score_count,v_mark_count,
    v_batch_count,v_signoff_count,v_correction_count,
    v_entries_count,v_notification_count;
END;
$cleanup$;

COMMIT;
