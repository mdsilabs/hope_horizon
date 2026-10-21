-- 0021 · Parent/guardian contact self-service without child-link editing.
-- Run after 0020. Modifies only users/parents contact fields and retains
-- the school's exclusive authority to link/unlink children.
BEGIN;

CREATE OR REPLACE FUNCTION public.hh_parent_update_contact(
  p_phone text,p_whatsapp text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $update$
DECLARE
  v_school uuid;
  v_user uuid;
  v_phone text := nullif(btrim(p_phone),'');
  v_whatsapp text := nullif(btrim(p_whatsapp),'');
BEGIN
  v_user:=auth.uid();
  SELECT u.school_id INTO v_school FROM public.users u
  WHERE u.id=v_user AND u.is_active AND NOT u.must_change_password
    AND u.role='PARENT'::public.user_role FOR UPDATE;
  IF v_school IS NULL THEN
    RAISE EXCEPTION 'Active parent account required' USING ERRCODE='42501';
  END IF;
  IF (v_phone IS NOT NULL AND
       (length(v_phone)>25 OR v_phone !~ '^\+?[0-9][0-9 ()-]{6,24}$'))
     OR (v_whatsapp IS NOT NULL AND
       (length(v_whatsapp)>25 OR v_whatsapp !~ '^\+?[0-9][0-9 ()-]{6,24}$')) THEN
    RAISE EXCEPTION 'Phone numbers must contain 7 to 25 valid characters'
      USING ERRCODE='22023';
  END IF;
  UPDATE public.parents
    SET phone=v_phone,whatsapp_number=v_whatsapp,updated_at=now()
    WHERE user_id=v_user AND school_id=v_school AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active parent record not found' USING ERRCODE='42501'; END IF;
  UPDATE public.users
    SET phone=v_phone,whatsapp_number=v_whatsapp,updated_at=now()
    WHERE id=v_user AND school_id=v_school AND role='PARENT'::public.user_role;
  IF NOT FOUND THEN RAISE EXCEPTION 'Guardian user profile changed; transaction rolled back' USING ERRCODE='42501'; END IF;
  INSERT INTO public.audit_logs(school_id,user_id,action,entity_type,entity_id,metadata)
  VALUES(v_school,v_user,'SYSTEM_SETTING_CHANGED'::public.audit_action,
    'parent_contact',v_user,'{"operation":"parent_contact_updated"}'::jsonb);
  RETURN true;
END;
$update$;
REVOKE ALL ON FUNCTION public.hh_parent_update_contact(text,text) FROM public,anon;
GRANT EXECUTE ON FUNCTION public.hh_parent_update_contact(text,text) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
