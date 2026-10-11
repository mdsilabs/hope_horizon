import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { getPublicSupabaseConfig } from "./config";

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
  const { url } = getPublicSupabaseConfig();
  const serviceRoleKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    throw new Error(
      "Missing server-only SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY. Configure a rotated credential in a private environment variable."
    );
  }

  return createSupabaseClient<Database>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
