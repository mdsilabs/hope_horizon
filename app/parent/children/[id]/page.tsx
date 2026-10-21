import Link from "next/link";
import {notFound} from "next/navigation";
import {BookOpen,GraduationCap,Printer,UserRound} from "lucide-react";
import {loadParentFamily} from "@/lib/parent/family";
import {createClient} from "@/lib/supabase/server";
import {Card} from "@/components/ui/Card";
import {EmptyState} from "@/components/ui/States";
import {uuidString} from "@/lib/validations/common";

export const dynamic="force-dynamic";

/**
 * An independent student detail page, NOT a student-account impersonation.
 * A parent can visit any of THEIR linked children, including multiple
 * siblings, but cannot access an unlinked student even with a guessed URL.
 */
export default async function ParentChildDetailPage({params}:{
  params:Promise<{id:string}>;
}){
  const family=await loadParentFamily();
  const id=uuidString.safeParse((await params).id);
  if(!id.success)notFound();
  const child=family.children.find(s=>s.id===id.data);
  if(!child)notFound();

  const db=await createClient();
  const {data:published,error}=await db.from("results")
    .select("id,student_id,overall_average,overall_position,attendance_present,attendance_absent,attendance_total_days,published_at,classes(name,arm),academic_sessions(name),terms(name)")
    .eq("school_id",family.schoolId)
    .eq("student_id",child.id)
    .eq("status","PUBLISHED")
    .order("published_at",{ascending:false})
    .limit(100);

  return <div className="mx-auto max-w-5xl space-y-6">
    <nav className="text-sm">
      <Link href="/parent/children" className="font-medium text-brand-700 hover:underline">← My children</Link>
    </nav>
    <Card className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-brand-50 p-3 text-brand-700">
          <UserRound className="h-6 w-6"/>
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-slate-900">{child.full_name}</h1>
          <p className="mt-1 text-sm text-slate-600">Admission number: {child.admission_number}</p>
          <p className="text-sm text-slate-600">
            Class: {child.classes?.name??"Not assigned"} {child.classes?.arm??""}
          </p>
        </div>
      </div>
      <p className="text-xs text-slate-500">
        This profile is read-only. Contact the school if a child is incorrectly linked
        or their admission/class information needs correction.
      </p>
      <Link href={`/parent/results?childId=${encodeURIComponent(child.id)}`}
        className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-600">
        <BookOpen className="h-4 w-4"/> View all published results
      </Link>
    </Card>

    <div>
      <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
        <GraduationCap className="h-5 w-5"/> Academic history
      </h2>
      <p className="mt-1 text-sm text-slate-600">
        Only official, published term reports are shown. Withdrawn or pending
        results are never exposed to parents.
      </p>
    </div>
    {error?<Card><p role="alert" className="text-sm text-red-700">
      Could not load published results. Please try again later.
    </p></Card>:!published?.length?
      <EmptyState title="No published report cards"
        description="The school will make term reports available after approval and publication."/>:
      <div className="grid gap-3 sm:grid-cols-2">
        {published.map(result=><Card key={result.id} className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-semibold text-slate-900">
                {result.academic_sessions?.name??"Session"} · {result.terms?.name??"Term"}
              </h3>
              <p className="text-sm text-slate-500">
                {result.classes?.name??"Class"} {result.classes?.arm??""}
              </p>
            </div>
            <span className="rounded-lg bg-green-50 px-3 py-1 text-xs font-medium text-green-800">
              Published
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 border-t pt-3 text-sm">
            <div><p className="text-slate-500">Average</p>
              <p className="font-semibold">{result.overall_average??"Not available"}</p></div>
            <div><p className="text-slate-500">Position</p>
              <p className="font-semibold">{result.overall_position??"Not available"}</p></div>
          </div>
          {result.attendance_total_days!=null&&
            <p className="text-sm text-slate-600">
              Attendance: {result.attendance_present??0} present,
              {" "}{result.attendance_absent??0} absent,
              {" "}{result.attendance_total_days} school days
            </p>}
          <div className="flex flex-wrap gap-3">
            <Link href={`/parent/results/${result.id}`}
              className="text-sm font-semibold text-brand-700 hover:underline">
              View report
            </Link>
            <Link href={`/reports/${result.id}`}
              className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline">
              <Printer className="h-4 w-4"/> Print
            </Link>
          </div>
        </Card>)}
      </div>}
  </div>;
}
