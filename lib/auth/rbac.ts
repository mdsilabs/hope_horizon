import { RESULT_APPROVER_ROLES } from "@/types/enums";
import type { UserRole } from "@/types/database";

/** Base route each role lands on after login. */
export const ROLE_HOME_ROUTE: Record<UserRole, string> = {
  ADMIN: "/admin",
  TEACHER: "/teacher",
  STUDENT: "/student",
  PARENT: "/parent",
  PRINCIPAL: "/principal",
  VICE_PRINCIPAL: "/vice-principal",
  ACCOUNTANT: "/accountant",
  OTHER: "/",
};

/** Which top-level route segment each role is permitted to access. */
export const ROLE_ALLOWED_SEGMENT: Record<UserRole, string> = {
  ADMIN: "admin",
  TEACHER: "teacher",
  STUDENT: "student",
  PARENT: "parent",
  PRINCIPAL: "principal",
  VICE_PRINCIPAL: "vice-principal",
  ACCOUNTANT: "accountant",
  OTHER: "",
};

export function canAccessSegment(role: UserRole, segment: string): boolean {
  if (role === "ADMIN") return true; // admins can access all dashboards
  return ROLE_ALLOWED_SEGMENT[role] === segment;
}

export function canApproveResults(role: UserRole): boolean {
  return (RESULT_APPROVER_ROLES as readonly string[]).includes(role);
}

export function isTeacherOrAbove(role: UserRole): boolean {
  return ["TEACHER", "ADMIN", "PRINCIPAL", "VICE_PRINCIPAL"].includes(role);
}
