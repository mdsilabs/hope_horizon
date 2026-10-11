import { z } from "zod";

const mobile = z.string().trim().max(32)
  .refine(v=>!v || /^[+0-9() .-]+$/.test(v),"Use a valid phone number.");

export const profilePatchSchema = z.object({
  name:z.string().trim().min(2).max(120),
  phone:mobile,
  whatsappNumber:mobile,
}).strict();

export const adminUserPatchSchema = z.object({
  name:z.string().trim().min(2).max(120),
  phone:mobile,
  whatsappNumber:mobile,
}).strict();

export const mediaSettingsSchema = z.object({
  cloudName:z.string().trim().regex(/^[A-Za-z0-9_-]{2,80}$/,"Enter a valid Cloudinary cloud name."),
  folder:z.string().trim().regex(/^[A-Za-z0-9_-]{2,48}$/,"Use a single folder name (letters, digits, - or _)."),
  enabled:z.boolean(),
}).strict();
