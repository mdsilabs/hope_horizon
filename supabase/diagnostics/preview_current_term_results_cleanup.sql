-- Hope Horizon Academy · CURRENT TERM RESULTS CLEANUP PREVIEW
-- READ-ONLY. Run in the project's Supabase SQL Editor.
-- Inspect the selected school and academic term. No data is modified.
WITH active_terms AS (
  SELECT s.id AS school_id, s.name AS school_name, s.current_term_id AS term_id,
         s.current_academic_session_id AS session_id, t.name AS term_name,
         a.name AS session_name
  FROM public.schools s
  JOIN public.terms t ON t.id=s.current_term_id AND t.school_id=s.id
  JOIN public.academic_sessions a ON a.id=s.current_academic_session_id
    AND a.id=t.academic_session_id AND a.school_id=s.id
)
SELECT school_id,school_name,term_id,term_name,session_id,session_name,
  (SELECT count(*) FROM public.results r WHERE r.school_id=x.school_id AND r.term_id=x.term_id) AS compiled_results,
  (SELECT count(*) FROM public.result_subject_scores sc
      JOIN public.results r ON r.id=sc.result_id
      WHERE r.school_id=x.school_id AND r.term_id=x.term_id) AS result_subject_scores,
  (SELECT count(*) FROM public.subject_markbooks m
      WHERE m.school_id=x.school_id AND m.term_id=x.term_id) AS subject_markbooks,
  (SELECT count(*) FROM public.class_result_batches b
      WHERE b.school_id=x.school_id AND b.term_id=x.term_id) AS class_result_batches,
  (SELECT count(*) FROM public.class_result_review_signoffs so
      WHERE so.school_id=x.school_id AND so.term_id=x.term_id) AS class_signoffs,
  (SELECT count(*) FROM public.class_subject_corrections c
      WHERE c.school_id=x.school_id AND c.term_id=x.term_id) AS class_corrections,
  (SELECT count(*) FROM public.class_report_entries e
      WHERE e.school_id=x.school_id AND e.term_id=x.term_id) AS class_attendance_remarks,
  (SELECT count(*) FROM public.results r
      WHERE r.school_id=x.school_id AND r.term_id=x.term_id
        AND r.status IN ('APPROVED','PUBLISHED','HIDDEN')) AS previously_approved_or_published_results,
  (SELECT count(*) FROM public.notifications n
      WHERE n.school_id=x.school_id
        AND ((n.related_entity_type='class_result_batch'
              AND EXISTS(SELECT 1 FROM public.class_result_batches b
                WHERE b.id=n.related_entity_id AND b.school_id=x.school_id AND b.term_id=x.term_id))
          OR (n.related_entity_type='result'
              AND EXISTS(SELECT 1 FROM public.results r
                WHERE r.id=n.related_entity_id AND r.school_id=x.school_id AND r.term_id=x.term_id))
          )) AS linked_workflow_notifications
FROM active_terms x ORDER BY school_name;

-- Extra inspection for the chosen school's active term. This is especially
-- important if approved/published results need to be preserved elsewhere.
SELECT s.id AS school_id, s.current_term_id AS term_id, c.id AS class_id,
       c.name AS class_name, c.arm,
       b.status AS batch_status, b.release_state,
       count(r.id) AS result_rows,
       count(r.id) FILTER (WHERE r.status='PUBLISHED') AS published_results
FROM public.schools s
JOIN public.classes c ON c.school_id=s.id
LEFT JOIN public.class_result_batches b
  ON b.school_id=s.id AND b.class_id=c.id AND b.term_id=s.current_term_id
LEFT JOIN public.results r
  ON r.school_id=s.id AND r.class_id=c.id AND r.term_id=s.current_term_id
WHERE s.current_term_id IS NOT NULL
GROUP BY s.id,s.current_term_id,c.id,c.name,c.arm,b.status,b.release_state
HAVING count(r.id)>0 OR b.status IS NOT NULL
ORDER BY c.name,c.arm;
