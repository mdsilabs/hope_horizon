import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * Service-role Supabase client. This BYPASSES Row Level Security entirely
 * and must never be imported into client code or exposed to the browser —
 * the `server-only` import above makes any accidental client-side import
 * fail at build time.
 *
 * Use only for: the seed script, admin user-provisioning (creating auth
 * users for new staff/students/parents), and other privileged operations
 * where RLS would otherwise correctly block a legitimate admin action.
 * Every route that uses this client MUST re-check the caller's role
 * itself (see lib/auth/requireRole.ts) since RLS is not doing that job.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Define them in .env.local (see .env.example)."
    );
  }

  return createSupabaseClient<Database>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
