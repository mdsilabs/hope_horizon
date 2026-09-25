import { z } from "zod";
import { objectIdString, emailSchema, schoolLevelSchema } from "./common";

export const parentSchema = z.object({
  fullName: z.string().trim().min(2, "Enter the parent's full name"),
  email: emailSchema.optional(),
  phone: z.string().trim().optional(),
  whatsappNumber: z.string().trim().optional(),
  studentIds: z.array(objectIdString).min(1, "Link at least one student"),
});
export type ParentInput = z.infer<typeof parentSchema>;

export const classSchema = z.object({
  name: z.string().trim().min(1, "Class name is required"),
  level: schoolLevelSchema,
  arm: z.string().trim().optional(),
  subjectIds: z.array(objectIdString).default([]),
  classTeacherId: objectIdString.optional(),
  order: z.coerce.number().int().default(0),
});
export type ClassInput = z.infer<typeof classSchema>;

export const subjectSchema = z.object({
  name: z.string().trim().min(1, "Subject name is required"),
  code: z.string().trim().min(1, "Subject code is required"),
  description: z.string().trim().optional(),
  applicableClassIds: z.array(objectIdString).default([]),
  caMaxScoreOverride: z.coerce.number().min(0).optional(),
  examMaxScoreOverride: z.coerce.number().min(0).optional(),
});
export type SubjectInput = z.infer<typeof subjectSchema>;

export const academicSessionSchema = z
  .object({
    name: z.string().trim().min(4, "e.g. 2025/2026"),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    isCurrent: z.boolean().default(false),
  })
  .refine((data) => data.endDate > data.startDate, {
    message: "End date must be after start date",
    path: ["endDate"],
  });
export type AcademicSessionInput = z.infer<typeof academicSessionSchema>;

export const termSchema = z
  .object({
    academicSessionId: objectIdString,
    name: z.string().trim().min(1, "Term/period name is required"),
    order: z.coerce.number().int().min(1),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    isCurrent: z.boolean().default(false),
  })
  .refine((data) => data.endDate > data.startDate, {
    message: "End date must be after start date",
    path: ["endDate"],
  });
export type TermInput = z.infer<typeof termSchema>;
