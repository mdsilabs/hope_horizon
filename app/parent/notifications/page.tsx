import {revalidatePath} from "next/cache";
import {redirect} from "next/navigation";
import {Bell,CheckCheck} from "lucide-react";
import Link from "next/link";
import {getCurrentSession} from "@/lib/auth/getCurrentSession";
import {createClient} from "@/lib/supabase/server";
import {uuidString} from "@/lib/validations/common";
import {Card} from "@/components/ui/Card";
import {EmptyState} from "@/components/ui/States";

async function markRead(formData:FormData){
  "use server";
  const session=await getCurrentSession();
  if(!session)redirect("/login");
  if(session.profile.role!=="PARENT")redirect("/");
  const id=uuidString.safeParse(formData.get("id"));
  if(!id.success)return;
  const db=await createClient();
  const {error}=await db.from("notifications")
    .update({read_at:new Date().toISOString(),status:"READ"})
    .eq("id",id.data).eq("recipient_id",session.authUserId)
    .eq("school_id",session.profile.school_id).eq("channel","IN_APP").is("read_at",null);
  if(error)throw new Error("Unable to mark notification as read.");
  revalidatePath("/parent/notifications");
}
async function markAllRead(){
  "use server";
  const session=await getCurrentSession();
  if(!session)redirect("/login");
  if(session.profile.role!=="PARENT")redirect("/");
  const db=await createClient();
  const {error}=await db.from("notifications")
    .update({read_at:new Date().toISOString(),status:"READ"})
    .eq("recipient_id",session.authUserId).eq("school_id",session.profile.school_id)
    .eq("channel","IN_APP").is("read_at",null);
  if(error)throw new Error("Could not mark your notifications as read.");
  revalidatePath("/parent/notifications");
}

export default async function ParentNotificationsPage({searchParams}:{
  searchParams:Promise<{filter?:string}>;
}){
  const session=await getCurrentSession();
  if(!session)redirect("/login");
  if(session.profile.role!=="PARENT")redirect("/");
  const db=await createClient();
  const {filter}=await searchParams;
  const unreadOnly=filter==="unread";
  let query=db.from("notifications")
    .select("id,title,message,created_at,read_at")
    .eq("recipient_id",session.authUserId).eq("school_id",session.profile.school_id)
    .eq("channel","IN_APP");
  if(unreadOnly)query=query.is("read_at",null);
  const {data,error}=await query.order("created_at",{ascending:false}).limit(50);
  const {count:unreadCount}=await db.from("notifications")
    .select("id",{head:true,count:"exact"})
    .eq("recipient_id",session.authUserId).eq("school_id",session.profile.school_id)
    .eq("channel","IN_APP").is("read_at",null);
  return <div className="mx-auto max-w-4xl space-y-6">
    <div><h1 className="flex items-center gap-2 font-display text-2xl font-semibold text-slate-900">
      <Bell className="h-6 w-6"/> Family notifications</h1>
      <p className="mt-1 text-sm text-slate-600">School messages addressed to your family account.</p></div>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <nav aria-label="Notification filter" className="flex flex-wrap gap-2">
        <Link href="/parent/notifications"
          aria-current={!unreadOnly?"page":undefined}
          className={"rounded-xl px-3 py-2 text-sm font-semibold "+(!unreadOnly?"bg-brand-50 text-brand-700":"border text-slate-600")}>
          All
        </Link>
        <Link href="/parent/notifications?filter=unread"
          aria-current={unreadOnly?"page":undefined}
          className={"rounded-xl px-3 py-2 text-sm font-semibold "+(unreadOnly?"bg-brand-50 text-brand-700":"border text-slate-600")}>
          Unread ({unreadCount??0})
        </Link>
      </nav>
      {(unreadCount??0)>0&&<form action={markAllRead}>
        <button type="submit" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-50">
          <CheckCheck className="h-4 w-4"/> Mark all read
        </button>
      </form>}
    </div>
    {error?<Card><p role="alert" className="text-sm text-red-700">Cannot load your notifications.</p></Card>:
      !data?.length?<EmptyState title="No notifications" description="School messages for your family will appear here."/>:
      <div className="space-y-3">{data.map(n=><Card key={n.id} className="flex flex-wrap justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-slate-900">{n.title}
            {!n.read_at&&<span className="ml-2 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">Unread</span>}
          </h2>
          <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-600">{n.message}</p>
          <p className="mt-2 text-xs text-slate-500">{new Date(n.created_at).toLocaleString("en-NG")}</p>
        </div>
        {!n.read_at&&<form action={markRead}>
          <input type="hidden" name="id" value={n.id}/>
          <button type="submit" className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50">
            <CheckCheck className="h-4 w-4"/> Mark read
          </button>
        </form>}
      </Card>)}</div>}
  </div>;
}
