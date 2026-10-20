-- 0018: Installation-wide maintenance switch.
-- Apply after 0017. Does not pause the portal by default.
-- Independent vendor owner is configured by the Next.js server environment.
-- Authenticated database writes are blocked at their source during a pause,
-- including direct PostgREST and SECURITY DEFINER workflow calls.
BEGIN;

CREATE TABLE IF NOT EXISTS public.platform_installation_controls(
  id smallint PRIMARY KEY CHECK(id=1),
  paused boolean NOT NULL DEFAULT false,
  notice text NOT NULL DEFAULT 'The school portal is temporarily unavailable for maintenance.',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.users(id)
);
INSERT INTO public.platform_installation_controls(id,paused)
VALUES(1,false)
ON CONFLICT(id) DO NOTHING;

ALTER TABLE public.platform_installation_controls ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_installation_controls FROM anon,authenticated;
GRANT SELECT ON public.platform_installation_controls TO anon,authenticated;
DROP POLICY IF EXISTS "public may inspect installation availability" ON public.platform_installation_controls;
CREATE POLICY "public may inspect installation availability"
 ON public.platform_installation_controls FOR SELECT TO anon,authenticated USING(id=1);

CREATE OR REPLACE FUNCTION public.hh_installation_pause_write_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $guard$
BEGIN
  -- SQL Editor migrations and service-role recovery remain available.
  -- JWT role reflects the original caller, even in a SECURITY DEFINER RPC.
  IF (SELECT c.paused FROM public.platform_installation_controls c WHERE c.id=1)
     AND (SELECT auth.role())='authenticated'
  THEN
    RAISE EXCEPTION 'The school portal is paused for maintenance; writes are disabled'
      USING ERRCODE='42501';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$guard$;
REVOKE ALL ON FUNCTION public.hh_installation_pause_write_guard() FROM public,anon,authenticated;

-- Install a database-level guard on the entire existing public application
-- data model (including junction tables without school_id). A missing trigger
-- on a future new table must be caught by migration review.
DO $guards$
DECLARE t record;
BEGIN
  FOR t IN SELECT c.relname
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p')
      AND c.relname NOT IN ('platform_installation_controls')
      AND NOT c.relispartition
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS hh_installation_pause_guard ON public.%I',t.relname);
    EXECUTE format('CREATE TRIGGER hh_installation_pause_guard BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.hh_installation_pause_write_guard()',t.relname);
  END LOOP;
END;
$guards$;

NOTIFY pgrst,'reload schema';
COMMIT;
