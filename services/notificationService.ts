import { createAdminClient } from "@/lib/supabase/admin";
import type { NotificationChannel, NotificationType } from "@/types/database";
import {sendGmailMessage} from "@/lib/email/gmail-smtp";

interface SendNotificationInput {
  schoolId: string;
  recipientId: string;
  title: string;
  message: string;
  type: NotificationType;
  channel: NotificationChannel; // EMAIL | WHATSAPP | IN_APP only
  relatedEntity?: { entityType: string; entityId: string };
}

/**
 * Creates a Notification row and (for EMAIL/WHATSAPP) hands off to the
 * relevant provider. EMAIL uses the configured Gmail SMTP transport (server only);
 * WHATSAPP remains a separate, unsupported provider until implemented. IN_APP notifications require no external provider.
 *
 * Uses the admin client because a teacher/approver triggering a
 * notification to a *different* user (e.g. notifying a student their
 * result was published) would otherwise be blocked by the notifications
 * insert policy, which only allows inserting into your own school.
 * Recipient/authorization checks for *why* a notification is being sent
 * happen in services/resultService.ts before this is ever called.
 */
export async function sendNotification(input: SendNotificationInput) {
  const supabase = createAdminClient();

  const { data: notification, error } = await supabase
    .from("notifications")
    .insert({
      school_id: input.schoolId,
      recipient_id: input.recipientId,
      title: input.title,
      message: input.message,
      type: input.type,
      channel: input.channel,
      related_entity_type: input.relatedEntity?.entityType,
      related_entity_id: input.relatedEntity?.entityId,
      status: "PENDING",
    })
    .select()
    .single();

  if (error || !notification) {
    console.error("[notificationService] Failed to create notification row:", error);
    return null;
  }

  let status: "SENT" | "FAILED" = "SENT";
  let failureReason: string | undefined;

  try {
    switch (input.channel) {
      case "IN_APP":
        // No external dispatch needed; it's already queryable via the API.
        break;
      case "EMAIL":
        await dispatchEmail(input);
        break;
      case "WHATSAPP":
        await dispatchWhatsapp(input);
        break;
      // No default: TypeScript's exhaustiveness check on NotificationChannel
      // will flag it at compile time if a new channel is ever added.
    }
  } catch (err) {
    status = "FAILED";
    failureReason = input.channel === "IN_APP" ? "Could not store notification" : "Message delivery failed";
    if(input.channel==="EMAIL")console.error("[notificationService] Gmail SMTP dispatch failed.");
  }

  await supabase
    .from("notifications")
    .update({ status, failure_reason: failureReason })
    .eq("id", notification.id);

  return { ...notification, status, failure_reason: failureReason };
}

async function dispatchEmail(input: SendNotificationInput): Promise<void> {
  const db=createAdminClient();
  const {data:recipient,error}=await db.from("users")
    .select("email,is_active,school_id").eq("id",input.recipientId)
    .eq("school_id",input.schoolId).maybeSingle();
  if(error||!recipient||!recipient.is_active)throw new Error("Notification recipient is inactive or missing.");
  await sendGmailMessage(recipient.email,input.title,input.message);
}

async function dispatchWhatsapp(_input: SendNotificationInput): Promise<void> {
  // Never acknowledge delivery when the transport is not configured.
  // Keep WHATSAPP in the supported enum for existing school data, but fail closed
  // until a provider implementation can confirm message acceptance.
  throw new Error("WhatsApp notification provider is not configured.");
}

export async function getUnreadCount(recipientId: string): Promise<number> {
  const supabase = createAdminClient();
  const { count } = await supabase
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .eq("recipient_id", recipientId)
    .eq("channel", "IN_APP")
    .is("read_at", null);
  return count ?? 0;
}

export async function markAsRead(notificationId: string): Promise<void> {
  const supabase = createAdminClient();
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString(), status: "READ" })
    .eq("id", notificationId);
}

export async function markAllAsRead(recipientId: string): Promise<void> {
  const supabase = createAdminClient();
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString(), status: "READ" })
    .eq("recipient_id", recipientId)
    .eq("channel", "IN_APP")
    .is("read_at", null);
}
