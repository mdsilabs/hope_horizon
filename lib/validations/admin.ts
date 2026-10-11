import { z } from "zod";
import { classSchema, subjectSchema } from "@/lib/validations/school-structure";
import { studentSchema } from "@/lib/validations/student";
import { uuidString } from "@/lib/validations/common";

// Keep the write surface smaller than the existing general-purpose schemas.
// Class-teacher assignments and parent links need their own verified workflows.
export const adminClassCreateSchema = classSchema.pick({
  name: true, level: true, arm: true, order: true,
}).strict();

export const adminSubjectCreateSchema = subjectSchema.pick({
  name: true, code: true, description: true,
  caMaxScoreOverride: true, examMaxScoreOverride: true,
}).strict();

export const adminStudentCreateSchema = studentSchema.omit({
  parentIds: true,
}).strict();

export const adminStudentPatchSchema = adminStudentCreateSchema.partial()
  .extend({ isActive: z.boolean().optional() })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "Provide at least one field to update.");

export const classSubjectActionSchema = z.object({
  subjectId: uuidString,
  action: z.enum(["ATTACH", "DETACH"]),
}).strict();
