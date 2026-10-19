-- Hope Horizon 0016: extend existing irregularity requests to class teachers.
-- Apply ONLY AFTER 0015. Safe for both newly deployed and already running
-- irregularities installations. Does not mutate student enrollment, grades,
-- marks, published reports, approvals or existing request history.
-- Does not change who can independently ENDORSE/APPROVE.
BEGIN;

CREATE OR REPLACE FUNCTION public.hh_submit_irregularity(
  p_kind text,p_class_id uuid,p_term_id uuid,p_subject_id uuid,p_student_id uuid,
  p_payload jsonb,p_reason text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $submit$
DECLARE
  v_school uuid; v_teacher uuid; v_class_teacher uuid; v_own_class boolean;
  v_count integer; v_request uuid; v_status text; v_ca numeric; v_exam numeric;
  v_student_name text; v_admission text; v_score_ca numeric; v_score_exam numeric;
BEGIN
  SELECT u.school_id INTO v_school FROM public.users u
    WHERE u.id=auth.uid() AND u.is_active AND u.role='TEACHER'::public.user_role
      AND NOT u.must_change_password;
  IF v_school IS NULL THEN RAISE EXCEPTION 'Active teacher account required' USING ERRCODE='42501'; END IF;
  SELECT t.id INTO v_teacher FROM public.teachers t
    WHERE t.user_id=auth.uid() AND t.school_id=v_school AND t.is_active;
  IF v_teacher IS NULL THEN RAISE EXCEPTION 'Teacher profile is inactive or missing' USING ERRCODE='42501'; END IF;
  IF p_kind NOT IN ('ADD_STUDENT','EDIT_MARK') OR length(btrim(coalesce(p_reason,''))) NOT BETWEEN 10 AND 1000
    OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Specify a supported change and a reason of 10 to 1000 characters' USING ERRCODE='22023';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.classes c
      WHERE c.id=p_class_id AND c.school_id=v_school AND c.is_active)
    OR NOT EXISTS(SELECT 1 FROM public.terms tr
      JOIN public.academic_sessions ses ON ses.id=tr.academic_session_id
      WHERE tr.id=p_term_id AND tr.school_id=v_school AND ses.school_id=v_school) THEN
    RAISE EXCEPTION 'Choose a class and term in your school' USING ERRCODE='22023';
  END IF;

  SELECT count(*), (array_agg(t.user_id ORDER BY t.user_id::text))[1] INTO v_count,v_class_teacher
  FROM public.teacher_classes tc
  JOIN public.teachers t ON t.id=tc.teacher_id
  JOIN public.users u ON u.id=t.user_id
  WHERE tc.class_id=p_class_id AND t.school_id=v_school AND t.is_active
    AND u.school_id=v_school AND u.is_active AND u.role='TEACHER'::public.user_role;
  IF v_count<>1 OR v_class_teacher IS NULL THEN
    RAISE EXCEPTION 'This class must have exactly one active class teacher assigned before requests can be routed'
      USING ERRCODE='22023';
  END IF;

  SELECT EXISTS(SELECT 1 FROM public.teacher_classes tc
    WHERE tc.class_id=p_class_id AND tc.teacher_id=v_teacher) INTO v_own_class;
  IF NOT v_own_class AND NOT EXISTS(SELECT 1 FROM public.teacher_subject_assignments a
    WHERE a.teacher_id=v_teacher AND a.class_id=p_class_id) THEN
    RAISE EXCEPTION 'This class is not assigned to you' USING ERRCODE='42501';
  END IF;

  IF p_kind='ADD_STUDENT' THEN
    IF p_student_id IS NOT NULL OR p_subject_id IS NOT NULL OR
       (SELECT count(*) FROM jsonb_object_keys(p_payload))<>2 OR
       NOT (p_payload ? 'fullName' AND p_payload ? 'admissionNumber') OR
       jsonb_typeof(p_payload->'fullName')<>'string' OR
       jsonb_typeof(p_payload->'admissionNumber')<>'string' THEN
      RAISE EXCEPTION 'Student addition requires name and admission number only' USING ERRCODE='22023';
    END IF;
    v_student_name:=btrim(p_payload->>'fullName');
    v_admission:=btrim(p_payload->>'admissionNumber');
    IF length(v_student_name) NOT BETWEEN 2 AND 120 OR length(v_admission) NOT BETWEEN 2 AND 50 THEN
      RAISE EXCEPTION 'Invalid student name or admission number' USING ERRCODE='22023'; END IF;
    IF EXISTS(SELECT 1 FROM public.students st
      WHERE st.school_id=v_school AND st.admission_number=v_admission) THEN
      RAISE EXCEPTION 'Admission number already exists in this school' USING ERRCODE='23505';
    END IF;
  ELSE
    IF p_student_id IS NULL OR p_subject_id IS NULL OR
      (SELECT count(*) FROM jsonb_object_keys(p_payload))<>2 OR
      NOT(p_payload ? 'ca' AND p_payload ? 'exam') OR
      jsonb_typeof(p_payload->'ca')<>'number' OR
      jsonb_typeof(p_payload->'exam')<>'number' THEN
      RAISE EXCEPTION 'Mark correction requires student, subject, CA and exam' USING ERRCODE='22023';
    END IF;
    -- Assigned class teacher may request a correction for ANY subject
    -- taught in the class. Subject teachers remain restricted to their own
    -- subject assignments. Approval still never edits student marks.
    IF (NOT v_own_class AND NOT EXISTS(
      SELECT 1 FROM public.teacher_subject_assignments a
      WHERE a.teacher_id=v_teacher AND a.class_id=p_class_id AND a.subject_id=p_subject_id))
      OR NOT EXISTS(SELECT 1 FROM public.class_subjects cs
        JOIN public.subjects sub ON sub.id=cs.subject_id
        WHERE cs.class_id=p_class_id AND cs.subject_id=p_subject_id
        AND sub.school_id=v_school AND sub.is_active)
      OR NOT EXISTS(SELECT 1 FROM public.students st
        WHERE st.id=p_student_id AND st.school_id=v_school
          AND st.class_id=p_class_id AND st.is_active) THEN
      RAISE EXCEPTION 'Student or subject is not assigned to this teacher and class' USING ERRCODE='42501';
    END IF;
    SELECT COALESCE(sub.ca_max_score_override,sch.ca_max_score),
       COALESCE(sub.exam_max_score_override,sch.exam_max_score)
      INTO v_ca,v_exam FROM public.subjects sub
      JOIN public.schools sch ON sch.id=sub.school_id
      WHERE sub.id=p_subject_id AND sch.id=v_school;
    v_score_ca:=(p_payload->>'ca')::numeric;
    v_score_exam:=(p_payload->>'exam')::numeric;
    IF v_score_ca<0 OR v_score_exam<0 OR v_score_ca>v_ca OR v_score_exam>v_exam THEN
      RAISE EXCEPTION 'Proposed marks exceed school score limits' USING ERRCODE='22023';
    END IF;
  END IF;

  -- Class teachers cannot endorse their own requests. Send their own
  -- requests straight to the independent administrator review step.
  v_status:=CASE WHEN v_class_teacher=auth.uid()
    THEN 'PENDING_ADMIN' ELSE 'PENDING_CLASS_TEACHER' END;

  INSERT INTO public.hh_irregularity_requests(
    school_id,term_id,class_id,subject_id,student_id,requester_id,
    class_teacher_id,kind,payload,reason,status
  ) VALUES(
    v_school,p_term_id,p_class_id,p_subject_id,p_student_id,auth.uid(),
    v_class_teacher,p_kind,p_payload,btrim(p_reason),v_status
  ) RETURNING id INTO v_request;

  INSERT INTO public.hh_irregularity_events(request_id,school_id,actor_id,event_type,note)
  VALUES(v_request,v_school,auth.uid(),'SUBMITTED',btrim(p_reason));

  IF v_status='PENDING_CLASS_TEACHER' THEN
    INSERT INTO public.notifications(school_id,recipient_id,title,message,type,channel,status,related_entity_type,related_entity_id)
    VALUES(v_school,v_class_teacher,'Teacher irregularity request',
      'A teacher has submitted an irregularity request for your assigned class. Review it in Class Requests.',
      'OTHER'::public.notification_type,'IN_APP'::public.notification_channel,
      'SENT'::public.notification_status,'irregularity_request',v_request);
  ELSE
    INSERT INTO public.notifications(school_id,recipient_id,title,message,type,channel,status,related_entity_type,related_entity_id)
    SELECT v_school,u.id,'Irregularity request awaiting administrator review',
      'A class teacher submitted a request requiring independent administrator review.',
      'OTHER'::public.notification_type,'IN_APP'::public.notification_channel,
      'SENT'::public.notification_status,'irregularity_request',v_request
    FROM public.users u WHERE u.school_id=v_school AND u.role='ADMIN'::public.user_role AND u.is_active;
  END IF;
  RETURN v_request;
END;
$submit$;

-- Keep the original role/school checks inside SECURITY DEFINER and
-- preserve existing EXECUTE grants for authenticated accounts.
REVOKE ALL ON FUNCTION public.hh_submit_irregularity(text,uuid,uuid,uuid,uuid,jsonb,text) FROM public,anon;
GRANT EXECUTE ON FUNCTION public.hh_submit_irregularity(text,uuid,uuid,uuid,uuid,jsonb,text) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
