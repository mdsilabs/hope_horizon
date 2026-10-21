import {z} from "zod";
const phone=z.string().trim().max(25,"Maximum 25 characters.")
  .refine(s=>!s || /^\+?[0-9][0-9 ()-]{6,24}$/.test(s),
    "Enter a valid phone number, optionally starting with +.");
export const parentContactSchema=z.object({
  phone,
  whatsappNumber:phone,
}).strict();
