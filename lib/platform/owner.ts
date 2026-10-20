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
export async function requirePlatformOwner(){
  const session=await requireRole(["ADMIN"]);
  if(!configuredPlatformOwner(session))
    throw new AuthorizationError("Only the original Primary Administrator may control this installation.");
  // Migration 0008 upgraded legacy ADMIN profiles to PRIMARY. Until the
  // uniqueness migration is applied, fail closed if the school has more
  // than one candidate instead of guessing which admin was first.
  const db=await createClient();
  const {count,error}=await db.from("users")
    .select("id",{head:true,count:"exact"})
    .eq("school_id",session.profile.school_id)
    .eq("role","ADMIN").eq("admin_tier","PRIMARY");
  if(error||count!==1)
    throw new AuthorizationError("Unique Primary Administrator could not be verified; resolve legacy admin records.");
  return session;
}
