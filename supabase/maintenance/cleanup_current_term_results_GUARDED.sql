-- HOPE HORIZON ACADEMY | CURRENT-TERM RESULTS CLEANUP - PHASE 2
-- DANGEROUS, DESTRUCTIVE, NOT REVERSIBLE AFTER COMMIT.
--
-- FIRST run preview_current_term_results_cleanup.sql and back up Supabase.
-- THEN supply the exact SCHOOL_ID, SESSION_ID, TERM_ID and 3 counts below.
-- This script ABORTS if scope/counts/confirmation don't match.
-- It deletes only current-term result workflow rows for ONE selected school.
-- It PRESERVES pupils, teachers, parent links, roles, classes, subjects,
-- class/teacher assignments, schools, academic sessions/terms,
-- notification history and audit logs.
--
-- SAFETY: The last line is ROLLBACK by default. Even after filling in all
-- confirmations, the first run is a transactional rehearsal only.
-- Inspect Supabase messages (RAISE NOTICE), then manually replace the
-- FINAL "ROLLBACK;" with "COMMIT;" and re-run ONLY when certain.
--
-- WARNING: If published/hidden results or released batches exist,
-- a SECOND explicit publication confirmation is required.

BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '120s';

DO $cleanup$
DECLARE
  -- ---- FILL FROM PHASE 1 PREVIEW ----
  v_school_id uuid := '00000000-0000-0000-0000-000000000000';
  v_expected_session_id uuid := '00000000-0000-0000-0000-000000000000';
  v_expected_term_id uuid := '00000000-0000-0000-0000-000000000000';
  v_expected_results bigint := -1;
  v_expected_markbooks bigint := -1;
  v_expected_batches bigint := -1;
  -- Required literal confirmation:
  v_confirmation text := 'NOT_CONFIRMED';
  -- Change only when PHASE 1 reports published/hidden results or
  -- released/legacy batches and you understand they will be deleted too:
  v_publication_confirmation text := 'NOT_CONFIRMED';
  -- ---- END REQUIRED SETTINGS ----

  v_actual_term uuid;
  v_actual_session uuid;
  v_count_results bigint;
  v_count_markbooks bigint;
  v_count_batches bigint;
  v_count_scores bigint;
  v_count_corrections bigint;
  v_count_signoffs bigint;
  v_count_reports bigint;
  v_count_published bigint;
  v_count_released bigint;
  v_unexpected_fk text;
  v_deleted_results bigint;
  v_deleted_markbooks bigint;
  v_deleted_batches bigint;
  v_deleted_scores bigint;
  v_deleted_corrections bigint;
  v_deleted_signoffs bigint;
  v_deleted_reports bigint;
BEGIN
  IF v_school_id = '00000000-0000-0000-0000-000000000000'::uuid
     OR v_expected_session_id = '00000000-0000-0000-0000-000000000000'::uuid
     OR v_expected_term_id = '00000000-0000-0000-0000-000000000000'::uuid
     OR v_expected_results < 0 OR v_expected_markbooks < 0
     OR v_expected_batches < 0 THEN
    RAISE EXCEPTION 'Fill in school/session/term UUIDs and result, markbook, batch counts from Phase 1 preview first';
  END IF;

  IF v_confirmation <> 'DELETE_THIS_SCHOOL_CURRENT_TERM_RESULTS' THEN
    RAISE EXCEPTION 'Explicit confirmation missing. No records have been deleted';
  END IF;

  -- Stop concurrent workflow requests which use the same class-row locks.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext(v_school_id::text), 832206
  );
  SELECT sch.current_term_id,sch.current_academic_session_id
    INTO v_actual_term,v_actual_session
    FROM public.schools sch
    WHERE sch.id=v_school_id FOR UPDATE;
  IF NOT FOUND OR v_actual_term IS DISTINCT FROM v_expected_term_id
       OR v_actual_session IS DISTINCT FROM v_expected_session_id THEN
    RAISE EXCEPTION 'School does not exist or CURRENT TERM/SESSION changed. Run Phase 1 preview again';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.terms t
    JOIN public.academic_sessions a ON a.id=t.academic_session_id
    WHERE t.id=v_expected_term_id AND t.school_id=v_school_id
      AND t.academic_session_id=v_expected_session_id
      AND a.school_id=v_school_id
  ) THEN
    RAISE EXCEPTION 'Selected term/session is not internally consistent with this school';
  END IF;

  PERFORM 1 FROM public.classes WHERE school_id=v_school_id FOR UPDATE;

  -- Fail closed if a newer schema added foreign keys referencing any of
  -- these results tables. The sole known child is result_subject_scores.
  SELECT string_agg(con.conname, ', ') INTO v_unexpected_fk
    FROM pg_catalog.pg_constraint con
    WHERE con.contype='f'
      AND con.confrelid = ANY (ARRAY[
        'public.results'::regclass,
        'public.result_subject_scores'::regclass,
        'public.subject_markbooks'::regclass,
        'public.class_result_batches'::regclass,
        'public.class_subject_corrections'::regclass,
        'public.class_result_review_signoffs'::regclass,
        'public.class_report_entries'::regclass
      ])
      AND NOT (
        con.confrelid='public.results'::regclass
        AND con.conrelid='public.result_subject_scores'::regclass
      );
  IF v_unexpected_fk IS NOT NULL THEN
    RAISE EXCEPTION 'Unexpected dependent foreign keys (%). Review them before any cleanup',v_unexpected_fk;
  END IF;

  SELECT count(*),
         count(*) FILTER (WHERE status IN ('PUBLISHED','HIDDEN'))
    INTO v_count_results,v_count_published
    FROM public.results
    WHERE school_id=v_school_id AND term_id=v_expected_term_id;
  SELECT count(*) INTO v_count_markbooks
    FROM public.subject_markbooks
    WHERE school_id=v_school_id AND term_id=v_expected_term_id;
  SELECT count(*),
         count(*) FILTER (WHERE release_state <> 'UNRELEASED')
    INTO v_count_batches,v_count_released
    FROM public.class_result_batches
    WHERE school_id=v_school_id AND term_id=v_expected_term_id;
  SELECT count(*) INTO v_count_scores
    FROM public.result_subject_scores sc
    JOIN public.results r ON r.id=sc.result_id
    WHERE r.school_id=v_school_id AND r.term_id=v_expected_term_id;
  SELECT count(*) INTO v_count_corrections
    FROM public.class_subject_corrections
    WHERE school_id=v_school_id AND term_id=v_expected_term_id;
  SELECT count(*) INTO v_count_signoffs
    FROM public.class_result_review_signoffs
    WHERE school_id=v_school_id AND term_id=v_expected_term_id;
  SELECT count(*) INTO v_count_reports
    FROM public.class_report_entries
    WHERE school_id=v_school_id AND term_id=v_expected_term_id;

  IF v_count_results <> v_expected_results
     OR v_count_markbooks <> v_expected_markbooks
     OR v_count_batches <> v_expected_batches THEN
    RAISE EXCEPTION 'Counts changed since Phase 1 preview: results %, markbooks %, batches %. Run preview again',
      v_count_results,v_count_markbooks,v_count_batches;
  END IF;

  IF (v_count_published > 0 OR v_count_released > 0)
     AND v_publication_confirmation <> 'DELETE_EXISTING_PUBLICATIONS_TOO' THEN
    RAISE EXCEPTION 'This current term has % published/hidden results and % released/legacy batches. Explicit second confirmation required',
      v_count_published,v_count_released;
  END IF;

  RAISE NOTICE 'CURRENT TERM DELETION REHEARSAL: school %, term %, results %, scores %, markbooks %, batches %, corrections %, signoffs %, attendance/remarks %, publications %, released batches %',
    v_school_id,v_expected_term_id,v_count_results,v_count_scores,
    v_count_markbooks,v_count_batches,v_count_corrections,
    v_count_signoffs,v_count_reports,v_count_published,v_count_released;

  -- Remove child/workflow rows first, without affecting other academic terms.
  DELETE FROM public.class_result_review_signoffs
    WHERE school_id=v_school_id AND term_id=v_expected_term_id;
  GET DIAGNOSTICS v_deleted_signoffs=ROW_COUNT;

  DELETE FROM public.class_subject_corrections
    WHERE school_id=v_school_id AND term_id=v_expected_term_id;
  GET DIAGNOSTICS v_deleted_corrections=ROW_COUNT;

  DELETE FROM public.class_report_entries
    WHERE school_id=v_school_id AND term_id=v_expected_term_id;
  GET DIAGNOSTICS v_deleted_reports=ROW_COUNT;

  DELETE FROM public.result_subject_scores sc USING public.results r
    WHERE sc.result_id=r.id
      AND r.school_id=v_school_id AND r.term_id=v_expected_term_id;
  GET DIAGNOSTICS v_deleted_scores=ROW_COUNT;

  DELETE FROM public.results
    WHERE school_id=v_school_id AND term_id=v_expected_term_id;
  GET DIAGNOSTICS v_deleted_results=ROW_COUNT;

  DELETE FROM public.class_result_batches
    WHERE school_id=v_school_id AND term_id=v_expected_term_id;
  GET DIAGNOSTICS v_deleted_batches=ROW_COUNT;

  DELETE FROM public.subject_markbooks
    WHERE school_id=v_school_id AND term_id=v_expected_term_id;
  GET DIAGNOSTICS v_deleted_markbooks=ROW_COUNT;

  IF v_deleted_results<>v_count_results
    OR v_deleted_scores<>v_count_scores
    OR v_deleted_batches<>v_count_batches
    OR v_deleted_markbooks<>v_count_markbooks
    OR v_deleted_signoffs<>v_count_signoffs
    OR v_deleted_corrections<>v_count_corrections
    OR v_deleted_reports<>v_count_reports THEN
    RAISE EXCEPTION 'Number of deleted rows did not match preflight counts. Entire transaction must be rolled back';
  END IF;

  -- Verify all seven sources of current-term exam data are now empty.
  IF EXISTS (SELECT 1 FROM public.results WHERE school_id=v_school_id AND term_id=v_expected_term_id)
    OR EXISTS (SELECT 1 FROM public.subject_markbooks WHERE school_id=v_school_id AND term_id=v_expected_term_id)
    OR EXISTS (SELECT 1 FROM public.class_result_batches WHERE school_id=v_school_id AND term_id=v_expected_term_id)
    OR EXISTS (SELECT 1 FROM public.class_subject_corrections WHERE school_id=v_school_id AND term_id=v_expected_term_id)
    OR EXISTS (SELECT 1 FROM public.class_result_review_signoffs WHERE school_id=v_school_id AND term_id=v_expected_term_id)
    OR EXISTS (SELECT 1 FROM public.class_report_entries WHERE school_id=v_school_id AND term_id=v_expected_term_id)
    THEN RAISE EXCEPTION 'Post-cleanup validation failed. Transaction must be rolled back';
  END IF;

  RAISE NOTICE 'VERIFIED: all seven target result datasets cleared for school %, term %. Final ROLLBACK below is still the default',v_school_id,v_expected_term_id;
END;
$cleanup$;

-- DEFAULT: REHEARSAL ONLY. ALL DELETIONS ABOVE ARE ROLLED BACK.
-- To actually delete, take a backup first and replace this ONE line
-- with COMMIT; after reviewing all notices and the exact school/term.
ROLLBACK;
