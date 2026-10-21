import Link from "next/link";
import {GraduationCap,BookOpen,UserRound} from "lucide-react";
import {loadParentFamily} from "@/lib/parent/family";
import {createClient} from "@/lib/supabase/server";
import {Card} from "@/components/ui/Card";
import {EmptyState} from "@/components/ui/States";

export default async function ParentChildrenPage(){
  const family=await loadParentFamily();
  const db=await createClient();
  const ids=family.children.map(c=>c.id);
  const {data:results,error:resultsError}=ids.length
    ?await db.from("results").select("id,student_id,overall_average,overall_position,published_at,terms(name),academic_sessions(name)")
       .eq("school_id",family.schoolId).eq("status","PUBLISHED")
       .in("student_id",ids).order("published_at",{ascending:false}).limit(300)
    :{data:[],error:null};
  const latest=new Map<string,NonNullable<typeof results>[number]>();
  if(!resultsError)for(const result of results??[]){
    if(!latest.has(result.student_id))latest.set(result.student_id,result);
  }
  return <div className="mx-auto max-w-5xl space-y-6">
    <div>
      <h1 className="flex items-center gap-2 font-display text-2xl font-semibold text-slate-900">
        <GraduationCap className="h-6 w-6"/> My children
      </h1>
      <p className="mt-1 text-sm text-slate-600">One family account can follow every child linked by the school.</p>
    </div>
    {!family.children.length?
      <EmptyState title="No children linked"
        description="Ask your school administrator to link your child's student record with your parent account."/>:
      <>
        <p className="text-sm text-slate-500">{family.children.length} linked {family.children.length===1?"child":"children"}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          {family.children.map(child=>{
            const recent=latest.get(child.id);
            return <Card key={child.id} className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-brand-50 p-3 text-brand-700">
                  <UserRound className="h-5 w-5"/>
                </div>
                <div className="min-w-0">
                  <h2 className="font-semibold text-slate-900">{child.full_name}</h2>
                  <p className="text-sm text-slate-600">Admission: {child.admission_number}</p>
                  <p className="text-sm text-slate-600">
                    Class: {child.classes?.name??"Unassigned"} {child.classes?.arm??""}
                  </p>
                </div>
              </div>
              <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
                {recent?
                  <div className="space-y-1">
                    <p className="font-medium">Latest published result</p>
                    <p>{recent.academic_sessions?.name} · {recent.terms?.name}</p>
                    <p>Average: {recent.overall_average??"Not shown"} · Position: {recent.overall_position??"Not shown"}</p>
                  </div>:
                  <p>No published results available for this child yet.</p>}
              </div>
              <div className="flex flex-wrap gap-3">
                <Link href={`/parent/children/${child.id}`}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50">
                  Child profile
                </Link>
                <Link href={`/parent/results?childId=${encodeURIComponent(child.id)}`}
                  className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-600">
                  <BookOpen className="h-4 w-4"/> View results
                </Link>
                {recent&&<Link href={`/parent/results/${recent.id}`}
                  className="inline-flex items-center rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50">
                  Latest report
                </Link>}
              </div>
            </Card>;
          })}
        </div>
      </>}
  </div>;
}
