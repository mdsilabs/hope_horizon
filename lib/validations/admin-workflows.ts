import { z } from "zod";
import { emailSchema, uuidString } from "@/lib/validations/common";

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .refine((value) => !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value, "Invalid calendar date");

export const teacherProvisionSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: emailSchema,
  staffId: z.string().trim().min(1).max(40),
}).strict();

export const teacherAssignmentsSchema = z.object({
  assignedClassIds: z.array(uuidString).max(150).default([]),
  subjectAssignments: z.array(z.object({
    classId: uuidString, subjectId: uuidString,
  }).strict()).max(250).default([]),
}).strict();

export const academicCreateSchema = z.object({
  name: z.string().trim().min(4).max(30),
  startDate: dateString,
  endDate: dateString,
}).strict().refine((v) => v.endDate > v.startDate, {path:["endDate"],message:"End date must follow start date"});

export const termCreateSchema = z.object({
  academicSessionId: uuidString,
  name: z.string().trim().min(2).max(50),
  order: z.number().int().min(1).max(12),
  startDate: dateString,
  endDate: dateString,
}).strict().refine((v) => v.endDate > v.startDate, {path:["endDate"],message:"End date must follow start date"});
