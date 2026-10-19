-- Hope Horizon 0015: teacher irregularity requests with named class teacher routing.
-- Applies AFTER 0014. This migration NEVER unlocks or alters a result or
-- enrollment. Approved requests require a separate authorized amendment.
-- Published records remain intact until that amendment is reviewed and applied.
BEGIN;

CREATE TABLE public.hh_irregularity_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id),
  term_id uuid NOT NULL REFERENCES public.terms(id),
  class_id uuid NOT NULL REFERENCES public.classes(id),
  subject_id uuid REFERENCES public.subjects(id),
  student_id uuid REFERENCES public.students(id),
  requester_id uuid NOT NULL REFERENCES public.users(id),
  class_teacher_id uuid NOT NULL REFERENCES public.users(id),
  kind text NOT NULL CHECK(kind IN ('ADD_STUDENT','EDIT_MARK')),
  payload jsonb NOT NULL,
  reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 10 AND 1000),
  status text NOT NULL DEFAULT 'PENDING_CLASS_TEACHER' CHECK(status IN (
    'PENDING_CLASS_TEACHER','PENDING_ADMIN','APPROVED_PENDING_APPLICATION',
    'REJECTED_CLASS_TEACHER','REJECTED_ADMIN'
  )),
  class_review_note text,
  class_reviewed_by uuid REFERENCES public.users(id),
  class_reviewed_at timestamptz,
  admin_decision_note text,
  admin_decided_by uuid REFERENCES public.users(id),
  admin_decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(
    (kind='ADD_STUDENT' AND subject_id IS NULL AND student_id IS NULL)
    OR (kind='EDIT_MARK' AND subject_id IS NOT NULL AND student_id IS NOT NULL)
  )
);
CREATE INDEX hh_irregularity_school_class ON public.hh_irregularity_requests(school_id,class_id,created_at DESC);
CREATE INDEX hh_irregularity_requester ON public.hh_irregularity_requests(requester_id,created_at DESC);
CREATE INDEX hh_irregularity_recipient ON public.hh_irregularity_requests(class_teacher_id,status,created_at DESC);

CREATE TABLE public.hh_irregularity_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  request_id uuid NOT NULL REFERENCES public.hh_irregularity_requests(id),
  school_id uuid NOT NULL REFERENCES public.schools(id),
  actor_id uuid NOT NULL REFERENCES public.users(id),
  event_type text NOT NULL CHECK (event_type IN (
    'SUBMITTED','CLASS_ENDORSED','CLASS_REJECTED','ADMIN_APPROVED','ADMIN_REJECTED'
  )),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX hh_irregularity_events_request ON public.hh_irregularity_events(request_id,id);

ALTER TABLE public.hh_irregularity_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hh_irregularity_events ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.hh_irregularity_requests,public.hh_irregularity_events TO authenticated;
REVOKE INSERT,UPDATE,DELETE ON public.hh_irregularity_requests,public.hh_irregularity_events FROM anon,authenticated;

CREATE POLICY "authorized staff see their school irregularity requests"
ON public.hh_irregularity_requests FOR SELECT TO authenticated
USING (
  school_id = (SELECT public.current_user_school_id())
  AND (
    (SELECT public.current_user_role())='ADMIN'::public.user_role
    OR requester_id=(SELECT auth.uid())
    OR (
      class_teacher_id=(SELECT auth.uid())
      AND EXISTS (
        SELECT 1 FROM public.teacher_classes tc
        JOIN public.teachers t ON t.id=tc.teacher_id
        WHERE tc.class_id=hh_irregularity_requests.class_id
          AND t.user_id=(SELECT auth.uid()) AND t.school_id=hh_irregularity_requests.school_id
          AND t.is_active
      )
    )
  )
);
CREATE POLICY "authorized viewers see request history"
ON public.hh_irregularity_events FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.hh_irregularity_requests r
  WHERE r.id=hh_irregularity_events.request_id AND r.school_id=hh_irregularity_events.school_id
));

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

  SELECT count(*), min(t.user_id) INTO v_count,v_class_teacher
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
    IF NOT EXISTS(SELECT 1 FROM public.teacher_subject_assignments a
      WHERE a.teacher_id=v_teacher AND a.class_id=p_class_id AND a.subject_id=p_subject_id)
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

CREATE OR REPLACE FUNCTION public.hh_class_review_irregularity(
  p_request_id uuid,p_action text,p_note text
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $classreview$
DECLARE v_request public.hh_irregularity_requests%ROWTYPE; v_school uuid; v_status text;
BEGIN
  SELECT u.school_id INTO v_school FROM public.users u
  WHERE u.id=auth.uid() AND u.is_active AND u.role='TEACHER'::public.user_role
    AND NOT u.must_change_password;
  SELECT * INTO v_request FROM public.hh_irregularity_requests r
    WHERE r.id=p_request_id AND r.school_id=v_school FOR UPDATE;
  IF NOT FOUND OR v_request.status<>'PENDING_CLASS_TEACHER'
    OR v_request.class_teacher_id<>auth.uid()
    OR v_request.requester_id=auth.uid()
    OR NOT EXISTS(SELECT 1 FROM public.teacher_classes tc
      JOIN public.teachers t ON t.id=tc.teacher_id
      WHERE tc.class_id=v_request.class_id AND t.user_id=auth.uid()
        AND t.school_id=v_school AND t.is_active) THEN
    RAISE EXCEPTION 'Only the assigned class teacher may review this pending request'
      USING ERRCODE='42501';
  END IF;
  IF p_action NOT IN('ENDORSE','REJECT') OR length(btrim(coalesce(p_note,'')))>1000
    OR (p_action='REJECT' AND length(btrim(coalesce(p_note,'')))<10) THEN
    RAISE EXCEPTION 'A valid decision and rejection reason are required' USING ERRCODE='22023';
  END IF;
  v_status:=CASE WHEN p_action='ENDORSE' THEN 'PENDING_ADMIN' ELSE 'REJECTED_CLASS_TEACHER' END;
  UPDATE public.hh_irregularity_requests SET status=v_status,class_review_note=NULLIF(btrim(p_note),''),
    class_reviewed_by=auth.uid(),class_reviewed_at=now(),updated_at=now()
    WHERE id=p_request_id;
  INSERT INTO public.hh_irregularity_events(request_id,school_id,actor_id,event_type,note)
  VALUES(p_request_id,v_school,auth.uid(),
    CASE WHEN p_action='ENDORSE' THEN 'CLASS_ENDORSED' ELSE 'CLASS_REJECTED' END,p_note);
  INSERT INTO public.notifications(school_id,recipient_id,title,message,type,channel,status,related_entity_type,related_entity_id)
  VALUES(v_school,v_request.requester_id,'Your irregularity request was reviewed',
    'A class-teacher decision is available in My Requests.',
    'OTHER'::public.notification_type,'IN_APP'::public.notification_channel,
    'SENT'::public.notification_status,'irregularity_request',p_request_id);
  IF p_action='ENDORSE' THEN
    INSERT INTO public.notifications(school_id,recipient_id,title,message,type,channel,status,related_entity_type,related_entity_id)
    SELECT v_school,u.id,'Irregularity request awaiting administrator review',
      'A class teacher endorsed a request. Review it in Administrator Requests.',
      'OTHER'::public.notification_type,'IN_APP'::public.notification_channel,
      'SENT'::public.notification_status,'irregularity_request',p_request_id
    FROM public.users u WHERE u.school_id=v_school AND u.role='ADMIN'::public.user_role AND u.is_active;
  END IF;
  RETURN v_status;
END;
$classreview$;

CREATE OR REPLACE FUNCTION public.hh_admin_review_irregularity(
  p_request_id uuid,p_action text,p_note text
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $adminreview$
DECLARE v_request public.hh_irregularity_requests%ROWTYPE; v_school uuid; v_status text;
BEGIN
  SELECT u.school_id INTO v_school FROM public.users u
  WHERE u.id=auth.uid() AND u.is_active AND u.role='ADMIN'::public.user_role
    AND NOT u.must_change_password;
  SELECT * INTO v_request FROM public.hh_irregularity_requests r
    WHERE r.id=p_request_id AND r.school_id=v_school FOR UPDATE;
  IF NOT FOUND OR v_request.status<>'PENDING_ADMIN' THEN
    RAISE EXCEPTION 'Only a pending request from your school can be reviewed'
      USING ERRCODE='42501';
  END IF;
  IF p_action NOT IN('APPROVE','REJECT') OR length(btrim(coalesce(p_note,'')))>1000
    OR (p_action='REJECT' AND length(btrim(coalesce(p_note,'')))<10) THEN
    RAISE EXCEPTION 'A valid administrative decision and rejection reason are required' USING ERRCODE='22023';
  END IF;
  v_status:=CASE WHEN p_action='APPROVE' THEN 'APPROVED_PENDING_APPLICATION' ELSE 'REJECTED_ADMIN' END;
  UPDATE public.hh_irregularity_requests SET status=v_status,
    admin_decision_note=NULLIF(btrim(p_note),''),
    admin_decided_by=auth.uid(),admin_decided_at=now(),updated_at=now()
    WHERE id=p_request_id;
  INSERT INTO public.hh_irregularity_events(request_id,school_id,actor_id,event_type,note)
  VALUES(p_request_id,v_school,auth.uid(),
    CASE WHEN p_action='APPROVE' THEN 'ADMIN_APPROVED' ELSE 'ADMIN_REJECTED' END,p_note);
  INSERT INTO public.notifications(school_id,recipient_id,title,message,type,channel,status,related_entity_type,related_entity_id)
  SELECT v_school,q.recipient_id,'Irregularity request administrator decision',
    'An administrator decision is available. Review the request status. Approved changes are not yet applied.',
    'OTHER'::public.notification_type,'IN_APP'::public.notification_channel,
    'SENT'::public.notification_status,'irregularity_request',p_request_id
  FROM (SELECT v_request.requester_id AS recipient_id
    UNION SELECT v_request.class_teacher_id AS recipient_id) q;
  RETURN v_status;
END;
$adminreview$;

-- Permission to invoke is not enough: all functions verify role, school and
-- assignment inside the SECURITY DEFINER body, using auth.uid().
REVOKE ALL ON FUNCTION public.hh_submit_irregularity(text,uuid,uuid,uuid,uuid,jsonb,text)
  FROM public,anon;
GRANT EXECUTE ON FUNCTION public.hh_submit_irregularity(text,uuid,uuid,uuid,uuid,jsonb,text)
  TO authenticated;
REVOKE ALL ON FUNCTION public.hh_class_review_irregularity(uuid,text,text)
  FROM public,anon;
GRANT EXECUTE ON FUNCTION public.hh_class_review_irregularity(uuid,text,text)
  TO authenticated;
REVOKE ALL ON FUNCTION public.hh_admin_review_irregularity(uuid,text,text)
  FROM public,anon;
GRANT EXECUTE ON FUNCTION public.hh_admin_review_irregularity(uuid,text,text)
  TO authenticated;

NOTIFY pgrst,'reload schema';
COMMIT;
