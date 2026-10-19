-- HOPE HORIZON ACADEMY | CURRENT-TERM RESULTS CLEANUP - PHASE 1
-- READ ONLY. Run this FIRST in Supabase SQL Editor.
-- Does not alter or delete any record.
-- Shows a row for every school with a configured current term.
-- Copy SCHOOL_ID, SESSION_ID, TERM_ID and three count fields into phase 2.
-- Back up production data before executing the irreversible phase 2.
WITH target AS (
  SELECT
    s.id AS school_id,
    s.name AS school_name,
    s.is_active AS school_active,
    s.current_academic_session_id AS session_id,
    a.name AS session_name,
    s.current_term_id AS term_id,
    t.name AS term_name,
    (s.current_academic_session_id IS NOT NULL
     AND t.id IS NOT NULL
     AND t.school_id = s.id
     AND t.academic_session_id = s.current_academic_session_id
     AND a.id = s.current_academic_session_id
     AND a.school_id = s.id) AS scope_consistent
  FROM public.schools s
  LEFT JOIN public.terms t ON t.id = s.current_term_id
  LEFT JOIN public.academic_sessions a ON a.id = s.current_academic_session_id
  WHERE s.current_term_id IS NOT NULL
)
SELECT
  x.school_id,
  x.school_name,
  x.school_active,
  x.session_id,
  x.session_name,
  x.term_id,
  x.term_name,
  x.scope_consistent,
  (SELECT count(*) FROM public.subject_markbooks m
   WHERE m.school_id=x.school_id AND m.term_id=x.term_id) AS subject_markbooks,
  (SELECT count(*) FROM public.class_result_batches b
   WHERE b.school_id=x.school_id AND b.term_id=x.term_id) AS class_result_batches,
  (SELECT count(*) FROM public.results r
   WHERE r.school_id=x.school_id AND r.term_id=x.term_id) AS results,
  (SELECT count(*) FROM public.result_subject_scores sc
   JOIN public.results r ON r.id=sc.result_id
   WHERE r.school_id=x.school_id AND r.term_id=x.term_id) AS result_subject_scores,
  (SELECT count(*) FROM public.class_subject_corrections c
   WHERE c.school_id=x.school_id AND c.term_id=x.term_id) AS class_subject_corrections,
  (SELECT count(*) FROM public.class_result_review_signoffs sg
   WHERE sg.school_id=x.school_id AND sg.term_id=x.term_id) AS class_result_review_signoffs,
  (SELECT count(*) FROM public.class_report_entries e
   WHERE e.school_id=x.school_id AND e.term_id=x.term_id) AS class_report_entries,
  (SELECT count(*) FROM public.results r
   WHERE r.school_id=x.school_id AND r.term_id=x.term_id
     AND r.status IN ('PUBLISHED','HIDDEN')) AS published_or_hidden_results,
  (SELECT count(*) FROM public.results r
   WHERE r.school_id=x.school_id AND r.term_id=x.term_id
     AND r.status='APPROVED') AS approved_results,
  (SELECT count(*) FROM public.class_result_batches b
   WHERE b.school_id=x.school_id AND b.term_id=x.term_id
     AND b.release_state <> 'UNRELEASED') AS released_or_legacy_batches
FROM target x
ORDER BY x.school_name, x.term_name;

-- Records NOT selected for cleanup:
-- schools, users, teachers, students, classes, subjects, terms,
-- academic_sessions, teacher_classes, teacher_subject_assignments,
-- class_subjects, parent links, audit logs, and notifications.
-- This operation leaves existing notification/audit history intact,
-- even if a message describes results that are later deleted.
