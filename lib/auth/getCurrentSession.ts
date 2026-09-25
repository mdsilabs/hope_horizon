import { createClient } from "@/lib/supabase/server";
import type { Database, UserRole } from "@/types/database";

export type UserProfile = Database["public"]["Tables"]["users"]["Row"];

export interface CurrentSession {
  authUserId: string;
  profile: UserProfile;
}

/**
 * Reads the current authenticated user (via the Supabase session cookie)
 * and their public.users profile row. Returns null if not signed in or
 * if no profile exists yet (e.g. the auth.users -> public.users sync
 * trigger hasn't run, which shouldn't normally happen — see
 * supabase/migrations/0003_auth_sync_trigger.sql).
 *
 * Every query made afterwards through the same server client is subject
 * to Row Level Security, so this function does not need to duplicate
 * authorization logic — RLS policies (supabase/migrations/0002_rls_policies.sql)
 * are the real enforcement point.
 */
export async function getCurrentSession(): Promise<CurrentSession | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase.from("users").select("*").eq("id", user.id).single();
  if (!profile) return null;

  return { authUserId: user.id, profile };
}

export function roleLabel(role: UserRole): string {
  const labels: Record<UserRole, string> = {
    ADMIN: "Administrator",
    TEACHER: "Teacher",
    STUDENT: "Student",
    PARENT: "Parent",
    PRINCIPAL: "Principal",
    VICE_PRINCIPAL: "Vice Principal",
    ACCOUNTANT: "Accountant",
    OTHER: "User",
  };
  return labels[role];
}
