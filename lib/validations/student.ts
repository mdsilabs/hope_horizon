import { z } from "zod";
import { objectIdString } from "./common";

export const studentSchema = z.object({
  fullName: z.string().trim().min(2, "Enter the student's full name"),
  admissionNumber: z.string().trim().min(1, "Admission number is required"),
  registrationNumber: z.string().trim().optional(),
  studentId: z.string().trim().optional(),
  classId: objectIdString,
  parentIds: z.array(objectIdString).default([]),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]).optional(),
  dateOfBirth: z.coerce.date().optional(),
  passportUrl: z.string().url().optional().or(z.literal("")),
});
export type StudentInput = z.infer<typeof studentSchema>;

export const bulkStudentRowSchema = studentSchema.omit({ parentIds: true });
export type BulkStudentRow = z.infer<typeof bulkStudentRowSchema>;
