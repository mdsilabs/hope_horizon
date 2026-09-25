/**
 * Central enum definitions for Hope Horizon Academy Results Portal.
 *
 * The actual string-union types now live in types/database.ts, generated
 * from (or hand-mirrored from) the Postgres enum types in
 * supabase/migrations/0001_init.sql — that SQL file is the single source
 * of truth. This file re-exports those types and adds the constant
 * arrays used for building <select> options, Zod enums, etc.
 *
 * IMPORTANT — NOTIFICATION CHANNELS:
 * Only EMAIL, WHATSAPP, and IN_APP are permitted anywhere in the system.
 * Do NOT add SMS or NONE. This is enforced here, in the Postgres enum
 * (supabase/migrations/0001_init.sql), and in the Zod validator
 * (lib/validations/notification.ts).
 */
export type {
  UserRole,
  SchoolLevel,
  AcademicStructureType,
  ResultStatus,
  NotificationChannel,
  NotificationStatus,
  NotificationType,
  AuditAction,
} from "@/types/database";

export const SCHOOL_LEVELS = ["PRIMARY", "SECONDARY", "COLLEGE", "UNIVERSITY", "OTHER"] as const;

export const USER_ROLES = [
  "ADMIN",
  "TEACHER",
  "STUDENT",
  "PARENT",
  "PRINCIPAL",
  "VICE_PRINCIPAL",
  "ACCOUNTANT",
  "OTHER",
] as const;

/** Roles permitted to review/approve results before publishing. Mirrors can_approve_results() in Postgres. */
export const RESULT_APPROVER_ROLES = ["ADMIN", "PRINCIPAL", "VICE_PRINCIPAL"] as const;

export const RESULT_ACCESS_METHODS = [
  "REGISTRATION_NUMBER",
  "ADMISSION_NUMBER",
  "STUDENT_ID",
  "USERNAME_PASSWORD",
  "SCRATCH_CARD_PIN",
  "OTP",
  "OTHER",
] as const;

export const RESULT_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "PENDING_APPROVAL",
  "APPROVED",
  "PUBLISHED",
  "HIDDEN",
] as const;

/**
 * NOTIFICATION CHANNELS — DO NOT ADD SMS OR NONE.
 * This restriction is intentional per school requirements.
 */
export const NOTIFICATION_CHANNELS = ["EMAIL", "WHATSAPP", "IN_APP"] as const;

export const NOTIFICATION_STATUSES = ["PENDING", "SENT", "FAILED", "READ"] as const;

export const NOTIFICATION_TYPES = [
  "RESULT_PUBLISHED",
  "RESULT_APPROVED",
  "RESULT_SUBMITTED_FOR_APPROVAL",
  "RESULT_HIDDEN",
  "ACCOUNT_CREATED",
  "PASSWORD_RESET",
  "SYSTEM_ANNOUNCEMENT",
  "OTHER",
] as const;

export const AUDIT_ACTIONS = [
  "LOGIN",
  "LOGOUT",
  "LOGIN_FAILED",
  "RESULT_CREATED",
  "RESULT_EDITED",
  "RESULT_SUBMITTED",
  "RESULT_APPROVED",
  "RESULT_PUBLISHED",
  "RESULT_HIDDEN",
  "RESULT_DELETED",
  "STUDENT_CREATED",
  "STUDENT_UPDATED",
  "STUDENT_DELETED",
  "TEACHER_CREATED",
  "TEACHER_UPDATED",
  "TEACHER_DELETED",
  "USER_ROLE_CHANGED",
  "PASSWORD_RESET_REQUESTED",
  "PASSWORD_RESET_COMPLETED",
  "SYSTEM_SETTING_CHANGED",
  "BULK_RESULT_UPLOAD",
] as const;

export const ACADEMIC_STRUCTURE_TYPES = ["TERM", "SEMESTER", "OTHER"] as const;

/** Default class levels from the requirements; schools can extend this via configurable settings. */
export const DEFAULT_CLASS_LEVELS = [
  "Pre-Nursery",
  "Nursery 1",
  "Nursery 2",
  "Basic 1",
  "Basic 2",
  "Basic 3",
  "Basic 4",
  "Basic 5",
  "JSS 1",
  "JSS 2",
  "JSS 3",
] as const;
