import { z } from "zod";
import { emailSchema, uuidString } from "./common";

export const studentAccountSchema = z.object({email:emailSchema}).strict();

export const parentCreateSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: emailSchema,
  phone: z.string().trim().max(40).optional(),
  studentIds: z.array(uuidString).min(1,"Select at least one child.").max(50)
    .refine(ids=>new Set(ids).size===ids.length,"Select each child once."),
}).strict();

export const parentChildrenSchema = parentCreateSchema.pick({studentIds:true}).strict();
