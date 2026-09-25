import { z } from "zod";
import { emailSchema, objectIdString } from "./common";

export const teacherSchema = z.object({
  fullName: z.string().trim().min(2, "Enter the teacher's full name"),
  email: emailSchema,
  staffId: z.string().trim().min(1, "Staff ID is required"),
  assignedClassIds: z.array(objectIdString).default([]),
  subjectAssignments: z
    .array(
      z.object({
        classId: objectIdString,
        subjectId: objectIdString,
      })
    )
    .default([]),
});
export type TeacherInput = z.infer<typeof teacherSchema>;
