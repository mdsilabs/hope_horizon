import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Bell, CheckCheck } from "lucide-react";
import { getCurrentSession } from "@/lib/auth/getCurrentSession";
import { createClient } from "@/lib/supabase/server";
import { uuidString } from "@/lib/validations/common";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/States";

async function markRead(formData: FormData) {
  "use server";
  const session = await getCurrentSession();
  if (!session || session.profile.role !== "TEACHER") redirect("/login");

  const parsed = uuidString.safeParse(formData.get("notificationId"));
  if (!parsed.success) return;

  // This request is scoped to the current user, school, channel and unread
  // status, in addition to the existing notifications UPDATE RLS policy.
  const db = await createClient();
  const { error } = await db.from("notifications")
    .update({read_at:new Date().toISOString(),status:"READ"})
    .eq("id",parsed.data)
    .eq("recipient_id",session.authUserId)
    .eq("school_id",session.profile.school_id)
    .eq("channel","IN_APP")
    .is("read_at",null);
  if (error) throw new Error("Could not mark this notification as read.");
  revalidatePath("/teacher/notifications");
}

export default async function TeacherNotificationsPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  if (session.profile.role !== "TEACHER") redirect("/");

  const db = await createClient();
  const {data,error} = await db.from("notifications")
    .select("id,title,message,created_at,read_at")
    .eq("recipient_id",session.authUserId)
    .eq("school_id",session.profile.school_id)
    .eq("channel","IN_APP")
    .order("created_at",{ascending:false})
    .limit(50);

  return <div className="mx-auto max-w-4xl space-y-6">
    <div>
      <h1 className="flex items-center gap-2 font-display text-2xl font-semibold text-slate-900">
        <Bell className="h-6 w-6"/> Notifications
      </h1>
      <p className="mt-1 text-sm text-slate-600">
        Your latest 50 in-app notifications about subject submissions and class results.
      </p>
    </div>
    {error ? (
      <Card><p role="alert" className="text-sm text-red-700">Could not load your notifications. Please try again later.</p></Card>
    ) : !data?.length ? (
      <EmptyState title="No notifications yet"
        description="Subject and class-result updates will appear here when they're available."/>
    ) : (
      <div className="space-y-3">
        {data.map(note=><Card key={note.id} className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-semibold text-slate-900">{note.title}</h2>
              {!note.read_at&&<span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700">Unread</span>}
            </div>
            <p className="whitespace-pre-wrap text-sm text-slate-600">{note.message}</p>
            <p className="text-xs text-slate-500">
              {new Date(note.created_at).toLocaleString("en-NG",{dateStyle:"medium",timeStyle:"short"})}
            </p>
          </div>
          {!note.read_at ? (
            <form action={markRead}>
              <input type="hidden" name="notificationId" value={note.id}/>
              <button type="submit" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50">
                <CheckCheck className="h-4 w-4"/> Mark as read
              </button>
            </form>
          ) : <span className="text-xs text-slate-500">Read</span>}
        </Card>)}
      </div>
    )}
  </div>;
}
