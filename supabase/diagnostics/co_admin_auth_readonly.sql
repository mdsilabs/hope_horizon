-- Hope Horizon - READ ONLY diagnosis for "Cannot create Co-Admin".
-- Run in the correct Supabase project's SQL Editor. Does NOT create users,
-- change security rules, reset credentials or modify tables.
-- Send only the output statuses, never passwords or project secret keys.

WITH evidence AS (
  SELECT
    to_regprocedure('public.handle_new_auth_user()') AS auth_function,
    (SELECT COUNT(*) FROM public.users u JOIN public.schools s ON s.id=u.school_id
      WHERE u.role='ADMIN'::public.user_role
        AND (to_jsonb(u)->>'admin_tier')='PRIMARY'
        AND u.is_active AND s.is_active) AS active_primary_admins,
    EXISTS(
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='users' AND column_name='admin_tier'
    ) AS tier_column,
    EXISTS(
      SELECT 1 FROM pg_trigger t
      WHERE t.tgrelid='auth.users'::regclass
        AND t.tgname='on_auth_user_created'
        AND NOT t.tgisinternal
        AND t.tgenabled IN ('O','A')
        AND t.tgfoid=to_regprocedure('public.handle_new_auth_user()')
    ) AS signup_trigger,
    EXISTS(
      SELECT 1 FROM pg_trigger t
      WHERE t.tgrelid='public.users'::regclass
        AND t.tgname='hh_admin_identity_guard'
        AND NOT t.tgisinternal
        AND t.tgenabled IN ('O','A')
    ) AS identity_guard,
    EXISTS(
      SELECT 1 FROM pg_trigger t
      WHERE t.tgrelid='public.users'::regclass
        AND t.tgname='hh_protect_password_setup_flag'
        AND NOT t.tgisinternal
        AND t.tgenabled IN ('O','A')
    ) AS password_guard,
    to_regprocedure('public.hh_onboarding_guard_ready()') IS NOT NULL
      AS onboarding_rpc
), findings AS (
  SELECT 'active_primary_admin' AS check_name,
       active_primary_admins >= 1 AS passed,
       active_primary_admins::text || ' active Primary Admin(s) found' AS finding FROM evidence
  UNION ALL SELECT 'admin_tier_column', tier_column,
       CASE WHEN tier_column THEN 'Column available' ELSE 'Migration 0008 schema not installed' END FROM evidence
  UNION ALL SELECT 'auth_signup_trigger', signup_trigger,
       CASE WHEN signup_trigger THEN 'Enabled and points to expected function'
            ELSE 'Missing, disabled or points to a different function' END FROM evidence
  UNION ALL SELECT 'co_admin_aware_auth_function',
       COALESCE(pg_get_functiondef(auth_function)::text ILIKE '%raw_app_meta_data%'
         AND pg_get_functiondef(auth_function)::text ILIKE '%admin_tier%'
         AND pg_get_functiondef(auth_function)::text ILIKE '%CO_ADMIN%',false),
       CASE WHEN auth_function IS NULL THEN 'Missing auth sync function'
            ELSE 'Check function includes trusted app_metadata and CO_ADMIN logic' END FROM evidence
  UNION ALL SELECT 'primary_admin_identity_guard', identity_guard,
       CASE WHEN identity_guard THEN 'Guard exists' ELSE 'Migration 0008 guard missing' END FROM evidence
  UNION ALL SELECT 'password_setup_guard', password_guard,
       CASE WHEN password_guard THEN 'Guard exists' ELSE 'Migration 0012 guard missing' END FROM evidence
  UNION ALL SELECT 'onboarding_capability', onboarding_rpc,
       CASE WHEN onboarding_rpc THEN 'RPC exists' ELSE 'Migration 0012 RPC missing' END FROM evidence
)
SELECT check_name,
  CASE WHEN passed THEN 'PASS' ELSE 'FAIL' END AS status,
  finding
FROM findings
ORDER BY check_name;

-- If all statuses PASS, inspect Supabase -> Logs -> Auth and Postgres logs
-- at the timestamp of a failed creation attempt. The underlying PostgreSQL
-- constraint/trigger error is not exposed in the standard browser response.
