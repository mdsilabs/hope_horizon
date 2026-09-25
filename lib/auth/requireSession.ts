import { getCurrentSession, type CurrentSession } from "./getCurrentSession";
import { AuthenticationError, AuthorizationError } from "@/lib/utils/errors";
import type { UserRole } from "@/types/database";

/** Requires a signed-in user with a linked profile, or throws AuthenticationError. */
export async function requireSession(): Promise<CurrentSession> {
  const session = await getCurrentSession();
  if (!session) {
    throw new AuthenticationError();
  }
  return session;
}

/** Requires a session AND that the role is one of `allowedRoles`, or throws AuthorizationError. */
export async function requireRole(allowedRoles: UserRole[]): Promise<CurrentSession> {
  const session = await requireSession();
  if (!allowedRoles.includes(session.profile.role)) {
    throw new AuthorizationError();
  }
  return session;
}
