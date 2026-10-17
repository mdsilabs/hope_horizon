-- Hope Horizon Co-Admin 500 - deeper read-only inspection.
-- Run only on the correct Hope Horizon Supabase project after reviewing SQL.
-- Reports schema/trigger structure, not emails, names, passwords or secrets.
-- No INSERT, UPDATE, DELETE or schema changes are performed.

WITH auth_function AS (
  SELECT p.oid,p.prosecdef,p.proowner,p.proconfig,
         pg_get_functiondef(p.oid) AS definition
  FROM pg_proc p WHERE p.oid=to_regprocedure('public.handle_new_auth_user()')
),
checks AS (
  SELECT
    jsonb_build_object(
      'exists', EXISTS(SELECT 1 FROM auth_function),
      'security_definer', (SELECT prosecdef FROM auth_function),
      'owner', (SELECT pg_get_userbyid(proowner) FROM auth_function),
      'trusts_app_metadata',
        (SELECT definition ILIKE '%raw_app_meta_data%' FROM auth_function),
      'co_admin_branch',
        (SELECT definition ILIKE '%CO_ADMIN%' FROM auth_function),
      'configured_search_path',
        (SELECT COALESCE(to_jsonb(proconfig),'[]'::jsonb) FROM auth_function)
    ) AS auth_sync_function,
    (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'name',t.tgname,
        'enabled',t.tgenabled,
        'function',t.tgfoid::regprocedure::text)
        ORDER BY t.tgname),'[]'::jsonb)
      FROM pg_trigger t
      WHERE t.tgrelid='auth.users'::regclass AND NOT t.tgisinternal
    ) AS custom_auth_user_triggers,
    (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'name',t.tgname,
        'enabled',t.tgenabled,
        'function',t.tgfoid::regprocedure::text)
        ORDER BY t.tgname),'[]'::jsonb)
      FROM pg_trigger t
      WHERE t.tgrelid='public.users'::regclass AND NOT t.tgisinternal
    ) AS custom_profile_triggers,
    (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'column',c.column_name,'type',c.data_type))
        ORDER BY c.column_name),'[]'::jsonb)
      FROM information_schema.columns c
      WHERE c.table_schema='public' AND c.table_name='users'
        AND c.is_nullable='NO' AND c.column_default IS NULL
        AND c.column_name NOT IN (
          'id','school_id','name','email','role','admin_tier','must_change_password'
        )
    ) AS unhandled_required_profile_columns,
    (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'name',c.conname,'definition',pg_get_constraintdef(c.oid))
        ORDER BY c.conname),'[]'::jsonb)
      FROM pg_constraint c
      WHERE c.conrelid='public.users'::regclass
        AND c.contype IN ('c','u','f')
    ) AS profile_constraints,
    (
      SELECT COUNT(*) FROM public.users
      WHERE role='ADMIN'::public.user_role
        AND admin_tier='PRIMARY' AND is_active
    ) AS active_primary_count
)
SELECT * FROM checks;

-- If these structures look correct, the decisive evidence must come from
-- Supabase Logs -> Postgres Logs at the exact timestamp of the failed
-- Auth Admin createUser request. It includes the real PostgreSQL error.
