import "server-only";
import {requireRole} from "@/lib/auth/requireSession";
import {AuthorizationError} from "@/lib/utils/errors";
import type {CurrentSession} from "@/lib/auth/getCurrentSession";

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
  return session;
}
