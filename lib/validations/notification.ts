import { z } from "zod";
import { objectIdString, notificationChannelSchema } from "./common";
import { NOTIFICATION_TYPES } from "@/types/enums";

/**
 * channel is restricted to EMAIL | WHATSAPP | IN_APP via
 * notificationChannelSchema (lib/validations/common.ts), which is built
 * from types/enums.ts NOTIFICATION_CHANNELS. Do not add SMS or NONE here
 * or anywhere else — this mirrors the Postgres enum restriction in
 * supabase/migrations/0001_init.sql.
 */
export const notificationSchema = z.object({
  recipientId: objectIdString,
  title: z.string().trim().min(1).max(150),
  message: z.string().trim().min(1).max(1000),
  type: z.enum(NOTIFICATION_TYPES).default("OTHER"),
  channel: notificationChannelSchema,
  relatedEntity: z
    .object({
      entityType: z.string(),
      entityId: objectIdString,
    })
    .optional(),
});
export type NotificationInput = z.infer<typeof notificationSchema>;
