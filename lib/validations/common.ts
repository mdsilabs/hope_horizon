import { z } from "zod";
import {
  USER_ROLES,
  SCHOOL_LEVELS,
  NOTIFICATION_CHANNELS,
  RESULT_STATUSES,
} from "@/types/enums";

export const uuidString = z
  .string()
  .uuid("Invalid identifier");

/** @deprecated use uuidString — kept as an alias during the Mongo->Postgres migration. */
export const objectIdString = uuidString;

export const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address");

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[A-Z]/, "Password must include an uppercase letter")
  .regex(/[a-z]/, "Password must include a lowercase letter")
  .regex(/[0-9]/, "Password must include a number");

export const userRoleSchema = z.enum(USER_ROLES);
export const schoolLevelSchema = z.enum(SCHOOL_LEVELS);
export const resultStatusSchema = z.enum(RESULT_STATUSES);

/** Re-exported for convenience so callers don't need two imports. */
export const notificationChannelSchema = z.enum(NOTIFICATION_CHANNELS);

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
