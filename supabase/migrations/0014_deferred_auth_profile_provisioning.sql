-- Hope Horizon 0014: defer trusted profile sync until GoTrue app_metadata exists.
--
-- Supabase Admin createUser may INSERT auth.users with provider-only metadata,
-- then UPDATE raw_app_meta_data later in the same signup operation.
-- Migration 0008 required school_id and role on INSERT and raised SQLSTATE 42501
-- ("Account must be provisioned by the school administrator") too early.
--
-- SECURITY RULE: never trust user_metadata for authorization; only app_metadata
-- may establish school_id, role and admin_tier. Missing claims create NO profile
-- and grant NO portal access (RLS and requireSession deny absent profiles).
--
-- Apply ONCE after 0013, to the verified Hope Horizon Supabase project.
-- No existing user profiles, grades or security policies are deleted.
BEGIN;

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $auth_profile$
DECLARE
  v_school_text text;
  v_role_text text;
  v_tier text;
  v_school_id uuid;
BEGIN
  -- A number of GoTrue updates do not modify the trusted claims.
  IF TG_OP = 'UPDATE'
     AND NEW.raw_app_meta_data IS NOT DISTINCT FROM OLD.raw_app_meta_data THEN
    RETURN NEW;
  END IF;

  v_school_text := NULLIF(NEW.raw_app_meta_data ->> 'school_id','');
  v_role_text := NULLIF(NEW.raw_app_meta_data ->> 'role','');
  v_tier := NULLIF(NEW.raw_app_meta_data ->> 'admin_tier','');

  -- Supabase Auth inserts the account BEFORE filling in app_metadata on some
  -- createUser paths. Do not provision an untrusted account on this first event.
  -- In particular, do NOT fall back to raw_user_meta_data, which the user
  -- controls and could exploit to assign themself ADMIN.
  IF v_school_text IS NULL OR v_role_text IS NULL THEN
    RETURN NEW;
  END IF;

  -- Profile creation happens only once. Do not mutate an existing user's
  -- school/role/tier when Auth metadata is updated later.
  IF EXISTS (SELECT 1 FROM public.users u WHERE u.id = NEW.id) THEN
    RETURN NEW;
  END IF;

  v_school_id := v_school_text::uuid;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext(v_school_id::text),832206
  );

  IF NOT EXISTS (
    SELECT 1 FROM public.schools sch
    WHERE sch.id=v_school_id AND sch.is_active
  ) THEN
    RAISE EXCEPTION 'Cannot provision an account for an inactive or unknown school'
      USING ERRCODE='42501';
  END IF;

  -- Preserve the exact initial/CO_ADMIN privilege rules from migration 0008.
  IF v_role_text='ADMIN' THEN
    IF v_tier='PRIMARY' THEN
      IF EXISTS (
        SELECT 1 FROM public.users u WHERE u.school_id=v_school_id
          AND u.role='ADMIN'::public.user_role
      ) THEN
        RAISE EXCEPTION 'School already has an administrator; create a CO_ADMIN'
          USING ERRCODE='42501';
      END IF;
    ELSIF v_tier='CO_ADMIN' THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.users u WHERE u.school_id=v_school_id
          AND u.role='ADMIN'::public.user_role
          AND u.admin_tier='PRIMARY' AND u.is_active
      ) THEN
        RAISE EXCEPTION 'Create the primary administrator first'
          USING ERRCODE='42501';
      END IF;
    ELSE
      RAISE EXCEPTION 'ADMIN provisioning requires a trusted admin_tier'
        USING ERRCODE='42501';
    END IF;
  ELSIF v_tier IS NOT NULL THEN
    RAISE EXCEPTION 'Only administrators may have an admin tier'
      USING ERRCODE='42501';
  END IF;

  INSERT INTO public.users (
    id,school_id,name,email,role,must_change_password,admin_tier
  )
  VALUES (
    NEW.id,v_school_id,
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'name',''),NEW.email),
    NEW.email,v_role_text::public.user_role,
    COALESCE((NEW.raw_app_meta_data->>'must_change_password')::boolean,false),
    v_tier
  );
  RETURN NEW;
END;
$auth_profile$;

-- The same trusted function now reacts to both insertion and later metadata
-- updates, without depending on GoTrue's internal write sequence.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT OR UPDATE OF raw_app_meta_data ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_auth_user();

-- Catch an incorrectly-installed trigger before committing.
DO $validate$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    WHERE t.tgrelid='auth.users'::regclass
      AND t.tgname='on_auth_user_created'
      AND t.tgfoid='public.handle_new_auth_user()'::regprocedure
      AND t.tgenabled IN ('O','A')
      -- Trigger event bitmask: INSERT=4, UPDATE=16.
      AND (t.tgtype::int & 4)=4
      AND (t.tgtype::int & 16)=16
  ) THEN
    RAISE EXCEPTION 'New Auth trigger was not installed correctly';
  END IF;
END;
$validate$;

COMMIT;

-- Read-only validation:
-- SELECT tgname,tgenabled,pg_get_triggerdef(oid)
-- FROM pg_trigger WHERE tgrelid='auth.users'::regclass
-- AND tgname='on_auth_user_created';
