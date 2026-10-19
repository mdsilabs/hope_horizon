import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Bell, CheckCheck, MailOpen } from "lucide-react";
import { getCurrentSession } from "@/lib/auth/getCurrentSession";
import { createClient } from "@/lib/supabase/server";
import { uuidString } from "@/lib/validations/common";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/States";

/**
 * Notification actions operate ONLY on the authenticated administrator's
 * in-app inbox. A Co-Admin cannot modify the Primary Admin's notifications,
 * and no service-role database bypass is used.
 */
async function markRead(formData: FormData) {
  "use server";
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  if (session.profile.role !== "ADMIN") redirect("/");

  const parsed = uuidString.safeParse(formData.get("notificationId"));
  if (!parsed.success) return;

  const db = await createClient();
  const { error } = await db.from("notifications")
    .update({ read_at: new Date().toISOString(), status: "READ" })
    .eq("id", parsed.data)
    .eq("school_id", session.profile.school_id)
    .eq("recipient_id", session.authUserId)
    .eq("channel", "IN_APP")
    .is("read_at", null);

  if (error) throw new Error("Unable to mark this notification as read.");
  revalidatePath("/admin/notifications");
}

async function markAllRead() {
  "use server";
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  if (session.profile.role !== "ADMIN") redirect("/");

  const db = await createClient();
  const { error } = await db.from("notifications")
    .update({ read_at: new Date().toISOString(), status: "READ" })
    .eq("school_id", session.profile.school_id)
    .eq("recipient_id", session.authUserId)
    .eq("channel", "IN_APP")
    .is("read_at", null);

  if (error) throw new Error("Unable to mark notifications as read.");
  revalidatePath("/admin/notifications");
}

export default async function AdminNotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  if (session.profile.role !== "ADMIN") redirect("/");

  const { filter } = await searchParams;
  const unreadOnly = filter === "unread";
  const db = await createClient();

  // Query the current admin's inbox, never another administrator's messages.
  // Supabase notification SELECT and UPDATE RLS enforce the same identity.
  let query = db.from("notifications")
    .select("id,title,message,type,created_at,read_at")
    .eq("school_id", session.profile.school_id)
    .eq("recipient_id", session.authUserId)
    .eq("channel", "IN_APP")
    .order("created_at", { ascending: false })
    .limit(50);

  if (unreadOnly) query = query.is("read_at", null);
  const [{ data, error }, unreadResult] = await Promise.all([
    query,
    db.from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("school_id", session.profile.school_id)
      .eq("recipient_id", session.authUserId)
      .eq("channel", "IN_APP")
      .is("read_at", null),
  ]);

  const failed = Boolean(error || unreadResult.error);
  const unreadCount = unreadResult.count ?? 0;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 font-display text-2xl font-semibold text-slate-900">
            <Bell className="h-6 w-6 text-brand-600" /> Notifications
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Your personal administrator inbox for school updates, results and account activity.
          </p>
        </div>
        {!failed && unreadCount > 0 && (
          <form action={markAllRead}>
            <button type="submit" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50">
              <CheckCheck className="h-4 w-4" /> Mark all as read
            </button>
          </form>
        )}
      </div>

      <Card className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">In-app notifications</p>
          <p className="mt-1 text-sm text-slate-500">
            {failed ? "Notification count unavailable" : `${unreadCount} unread`} · Showing up to 50 recent messages
          </p>
        </div>
        <nav className="flex gap-2" aria-label="Notification filters">
          <Link href="/admin/notifications"
            aria-current={!unreadOnly ? "page" : undefined}
            className={`rounded-lg px-3 py-2 text-sm font-medium ${!unreadOnly ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-50"}`}>
            All
          </Link>
          <Link href="/admin/notifications?filter=unread"
            aria-current={unreadOnly ? "page" : undefined}
            className={`rounded-lg px-3 py-2 text-sm font-medium ${unreadOnly ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-50"}`}>
            Unread
          </Link>
        </nav>
      </Card>

      {failed ? (
        <Card>
          <p role="alert" className="text-sm text-red-700">
            Could not load notifications. Please refresh the page or contact your system administrator.
          </p>
        </Card>
      ) : !data?.length ? (
        <EmptyState
          icon={<MailOpen className="h-6 w-6" />}
          title={unreadOnly ? "All caught up" : "No notifications yet"}
          description={unreadOnly
            ? "You have no unread in-app notifications."
            : "School system updates addressed to your administrator account will appear here."}
        />
      ) : (
        <div className="space-y-3">
          {data.map(note => (
            <Card key={note.id} className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-semibold text-slate-900">{note.title}</h2>
                  {!note.read_at && (
                    <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700">
                      Unread
                    </span>
                  )}
                </div>
                <p className="text-xs font-medium text-slate-500">
                  {note.type.replace(/_/g, " ")}
                </p>
                <p className="whitespace-pre-wrap break-words text-sm text-slate-600">{note.message}</p>
                <p className="text-xs text-slate-500">
                  {new Date(note.created_at).toLocaleString("en-NG", {
                    dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Lagos",
                  })}
                </p>
              </div>
              {!note.read_at ? (
                <form action={markRead}>
                  <input type="hidden" name="notificationId" value={note.id} />
                  <button type="submit" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50">
                    <CheckCheck className="h-4 w-4" /> Mark as read
                  </button>
                </form>
              ) : (
                <span className="text-xs font-medium text-slate-500">Read</span>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
