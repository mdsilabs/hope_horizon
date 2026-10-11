import { z } from "zod";
import { emailSchema } from "./common";

const common = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: emailSchema,
});
export const coAdminCreateSchema = z.discriminatedUnion("setupMethod",[
  common.extend({setupMethod:z.literal("TEMPORARY_PASSWORD")}).strict(),
  common.extend({setupMethod:z.literal("EMAIL_LINK")}).strict(),
]);

export const coAdminStatusSchema = z.object({
  isActive: z.boolean(),
}).strict();

export type AdminTier = "PRIMARY" | "CO_ADMIN";
export function mayChangeCoAdmin(actorId: string, targetId: string, targetTier: AdminTier, targetRole: string): boolean {
  return actorId !== targetId && targetRole === "ADMIN" && targetTier === "CO_ADMIN";
}
