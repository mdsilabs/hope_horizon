import {z} from "zod";
import {passwordSchema} from "@/lib/validations/common";

export const setPasswordSchema=z.object({
  newPassword:passwordSchema.min(12,"Use at least 12 characters"),
  currentPassword:z.string().min(1).optional(),
}).strict();
