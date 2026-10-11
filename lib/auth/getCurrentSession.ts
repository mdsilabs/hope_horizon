import { createClient } from "@/lib/supabase/server";
import type { Database, UserRole } from "@/types/database";

export type UserProfile = Database["public"]["Tables"]["users"]["Row"];

export interface CurrentSession {
  authUserId: string;
  profile: UserProfile;
}

/**
 * Read the session/profile through RLS. Deactivated profiles are not
 * authorised, even when their Supabase Auth cookie remains valid.
 */
export async function getCurrentSession(): Promise<CurrentSession | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase.from("users").select("*").eq("id", user.id).single();
  if (!profile || !profile.is_active) return null;

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
