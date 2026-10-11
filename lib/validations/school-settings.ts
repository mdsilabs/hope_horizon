import { z } from "zod";
import { ACADEMIC_STRUCTURE_TYPES, SCHOOL_LEVELS } from "@/types/enums";

const optionalEmail = z.string().trim().max(254)
  .refine(value => value === "" || z.string().email().safeParse(value).success, "Enter a valid email address.");

const optionalWebsite = z.string().trim().max(250)
  .refine(value => {
    if (!value) return true;
    try {
      const url = new URL(value);
      return (url.protocol === "https:" || url.protocol === "http:") && !!url.hostname &&
        !url.username && !url.password;
    } catch { return false; }
  }, "Enter a full http:// or https:// website address.");

export const schoolSettingsSchema = z.object({
  name: z.string().trim().min(3).max(160),
  contactEmail: optionalEmail,
  contactPhone: z.string().trim().max(40).regex(/^[0-9+() .-]*$/, "Enter a valid contact phone number."),
  address: z.string().trim().max(350),
  website: optionalWebsite,
  levels: z.array(z.enum(SCHOOL_LEVELS)).min(1).max(SCHOOL_LEVELS.length)
    .refine(values => new Set(values).size === values.length, "Choose each school level only once."),
  academicStructureType: z.enum(ACADEMIC_STRUCTURE_TYPES),
  academicPeriodLabel: z.string().trim().min(2).max(40),
  periodsPerSession: z.number().int().min(1).max(6),
  caMaxScore: z.number().int().min(0).max(100),
  examMaxScore: z.number().int().min(0).max(100),
}).strict().refine(value => value.caMaxScore + value.examMaxScore === 100, {
  path: ["examMaxScore"], message: "CA and exam maximums must add up to 100.",
});

export type SchoolSettingsInput = z.infer<typeof schoolSettingsSchema>;
