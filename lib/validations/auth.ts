import { z } from "zod";
import { emailSchema, passwordSchema } from "./common";

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required"),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({
    token: z.string().min(1),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

/** Alternate result-access methods, distinct from staff/admin login. */
export const resultLookupSchema = z.object({
  method: z.enum([
    "REGISTRATION_NUMBER",
    "ADMISSION_NUMBER",
    "STUDENT_ID",
    "SCRATCH_CARD_PIN",
    "OTP",
  ]),
  identifier: z.string().min(1, "This field is required"),
  secret: z.string().min(1, "This field is required").optional(),
});
export type ResultLookupInput = z.infer<typeof resultLookupSchema>;
