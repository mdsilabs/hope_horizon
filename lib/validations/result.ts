import { z } from "zod";
import { objectIdString } from "./common";

export const subjectScoreSchema = z.object({
  subjectId: objectIdString,
  ca: z.coerce.number().finite().min(0, "CA score cannot be negative"),
  exam: z.coerce.number().finite().min(0, "Exam score cannot be negative"),
});
export type SubjectScoreInput = z.infer<typeof subjectScoreSchema>;

export const resultSchema = z.object({
  studentId: objectIdString,
  classId: objectIdString,
  academicSessionId: objectIdString,
  termId: objectIdString,
  subjects: z.array(subjectScoreSchema).min(1, "Add at least one subject score")
    .refine(scores => new Set(scores.map(score => score.subjectId)).size === scores.length, "Each subject may appear only once"),
  attendance: z
    .object({
      present: z.coerce.number().int().min(0).max(366),
      absent: z.coerce.number().int().min(0).max(366),
      totalDays: z.coerce.number().int().min(1).max(366),
    }).refine(a => a.present + a.absent === a.totalDays, "Present and absent days must equal total school days")
    .optional(),
  teacherRemarks: z.string().trim().max(500).optional(),
});
export type ResultInput = z.infer<typeof resultSchema>;

export const resultApprovalSchema = z.object({
  resultId: objectIdString,
  action: z.enum(["APPROVE", "REJECT"]),
  principalRemarks: z.string().trim().max(500).optional(),
  rejectionReason: z.string().trim().max(500).optional(),
});
export type ResultApprovalInput = z.infer<typeof resultApprovalSchema>;

export const bulkResultUploadRowSchema = z.object({
  admissionNumber: z.string().trim().min(1),
  subjectCode: z.string().trim().min(1),
  ca: z.coerce.number().finite().min(0),
  exam: z.coerce.number().finite().min(0),
});
export type BulkResultUploadRow = z.infer<typeof bulkResultUploadRowSchema>;
