import Link from "next/link";
import {GraduationCap,BookOpen,Bell,ArrowRight} from "lucide-react";
import {loadParentFamily} from "@/lib/parent/family";
import {createClient} from "@/lib/supabase/server";
import {Card} from "@/components/ui/Card";
import {EmptyState} from "@/components/ui/States";

export default async function ParentDashboardPage(){
  const family=await loadParentFamily();
  const db=await createClient();
  const ids=family.children.map(c=>c.id);
  const [published,unread]=await Promise.all([
    ids.length?db.from("results")
      .select("id",{head:true,count:"exact"}).eq("school_id",family.schoolId)
      .eq("status","PUBLISHED").in("student_id",ids)
      :Promise.resolve({count:0,error:null}),
    db.from("notifications").select("id",{head:true,count:"exact"})
      .eq("recipient_id",family.userId).eq("school_id",family.schoolId)
      .eq("channel","IN_APP").is("read_at",null),
  ]);
  return <div className="mx-auto max-w-6xl space-y-6">
    <div>
      <h1 className="font-display text-2xl font-semibold text-slate-900">
        Welcome, {family.parentName.split(" ")[0]}
      </h1>
      <p className="mt-1 text-sm text-slate-600">Follow all your children from a single secure family account.</p>
    </div>
    <div className="grid gap-4 sm:grid-cols-3">
      <Card><div className="flex items-center gap-2 text-sm text-slate-500"><GraduationCap className="h-4 w-4"/> Children</div>
        <p className="mt-2 text-3xl font-semibold">{family.children.length}</p></Card>
      <Card><div className="flex items-center gap-2 text-sm text-slate-500"><BookOpen className="h-4 w-4"/> Published results</div>
        <p className="mt-2 text-3xl font-semibold">{published.error?"—":published.count??0}</p></Card>
      <Card><div className="flex items-center gap-2 text-sm text-slate-500"><Bell className="h-4 w-4"/> Unread notifications</div>
        <p className="mt-2 text-3xl font-semibold">{unread.error?"—":unread.count??0}</p></Card>
    </div>
    <div className="flex flex-wrap gap-3">
      <Link href="/parent/children" className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-600">
        My children <ArrowRight className="h-4 w-4"/>
      </Link>
      <Link href="/parent/results" className="inline-flex items-center rounded-xl border px-4 py-2.5 text-sm font-semibold text-brand-700 hover:bg-brand-50">
        Published results
      </Link>
      <Link href="/parent/notifications" className="inline-flex items-center rounded-xl border px-4 py-2.5 text-sm font-semibold text-brand-700 hover:bg-brand-50">
        Notifications
      </Link>
      <Link href="/parent/account" className="inline-flex items-center rounded-xl border px-4 py-2.5 text-sm font-semibold text-brand-700 hover:bg-brand-50">
        My contact details
      </Link>
    </div>
    {!family.children.length?<EmptyState
      title="No children linked"
      description="Contact the school's administrator to link your children's records to this parent account."/>:
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {family.children.map(child=><Card key={child.id} className="space-y-2">
          <h2 className="font-semibold text-slate-900">{child.full_name}</h2>
          <p className="text-sm text-slate-600">{child.classes?.name??"Class"} {child.classes?.arm??""}</p>
          <p className="text-xs text-slate-500">Admission: {child.admission_number}</p>
          <div className="flex flex-wrap gap-3">
            <Link href={`/parent/children/${child.id}`}
              className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline">
              Child profile <ArrowRight className="h-4 w-4"/>
            </Link>
            <Link href={`/parent/results?childId=${encodeURIComponent(child.id)}`}
              className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline">
              Published results
            </Link>
          </div>
        </Card>)}
      </div>}
  </div>;
}
