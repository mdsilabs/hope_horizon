import "server-only";
import {requireRole} from "@/lib/auth/requireSession";
import {AuthorizationError} from "@/lib/utils/errors";
import type {CurrentSession} from "@/lib/auth/getCurrentSession";
import {createClient} from "@/lib/supabase/server";

/**
 * The original administrator is the school's immutable PRIMARY admin.
 * Co-Admins must never receive destructive or installation-wide controls.
 * Migration 0019 refuses ambiguous/multiple PRIMARY accounts.
 */
export function configuredPlatformOwner(session:CurrentSession):boolean{
  return session.profile.role==="ADMIN" &&
    session.profile.admin_tier==="PRIMARY" &&
    session.profile.is_active &&
    !session.profile.must_change_password;
}
export async function isVerifiedPlatformOwner(session:CurrentSession):Promise<boolean>{
  if(!configuredPlatformOwner(session))return false;
  // A school with legacy duplicate PRIMARY profiles has no trusted single
  // Super Admin until migration 0019's uniqueness prerequisite is resolved.
  const db=await createClient();
  const {count,error}=await db.from("users")
    .select("id",{head:true,count:"exact"})
    .eq("school_id",session.profile.school_id)
    .eq("role","ADMIN").eq("admin_tier","PRIMARY");
  return !error&&count===1;
}
export async function requirePlatformOwner(){
  const session=await requireRole(["ADMIN"]);
  if(!await isVerifiedPlatformOwner(session))
    throw new AuthorizationError("Only the uniquely verified original Primary Administrator may control this installation.");
  return session;
}
