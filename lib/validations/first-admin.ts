import { z } from "zod";
import { emailSchema, uuidString } from "./common";

export const firstAdminSetupSchema = z.object({
  adminName: z.string().trim().min(2, "Enter your full name.").max(120),
  adminEmail: emailSchema,
  adminPassword: z.string()
    .min(12, "Use at least 12 characters.")
    .max(128, "Password is too long.")
    .regex(/[a-z]/, "Include a lowercase letter.")
    .regex(/[A-Z]/, "Include an uppercase letter.")
    .regex(/[0-9]/, "Include a number.")
    .regex(/[^A-Za-z0-9]/, "Include a symbol."),
  schoolName: z.string().trim().min(3).max(160).default("Hope Horizon Academy"),
  schoolId: uuidString.optional(),
  confirmation: z.literal("CREATE_FIRST_ADMIN"),
}).strict();

export type FirstAdminSetupInput = z.infer<typeof firstAdminSetupSchema>;
