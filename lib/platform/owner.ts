import "server-only";
import {requireRole} from "@/lib/auth/requireSession";
import {AuthorizationError} from "@/lib/utils/errors";
import type {CurrentSession} from "@/lib/auth/getCurrentSession";

export function configuredPlatformOwner(session:CurrentSession):boolean{
  const id=process.env.PLATFORM_SUPERADMIN_AUTH_USER_ID?.trim();
  const schoolId=process.env.PLATFORM_INSTALLATION_SCHOOL_ID?.trim();
  // Default deny; PRIMARY school administrators are NOT platform owners.
  return !!id&&!!schoolId&&
    /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(id)&&
    session.authUserId===id&&
    session.profile.school_id===schoolId&&
    session.profile.role==="ADMIN"&&session.profile.is_active===true;
}
export async function requirePlatformOwner(){
  const session=await requireRole(["ADMIN"]);
  if(!configuredPlatformOwner(session)){
    throw new AuthorizationError("This operation requires the separately configured platform owner.");
  }
  return session;
}
