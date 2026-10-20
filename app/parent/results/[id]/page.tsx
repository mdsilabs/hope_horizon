import {loadParentFamily} from "@/lib/parent/family";
import {notFound} from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchResultDetail } from "@/services/resultQueries";
import { ResultDetailCard } from "@/components/results/ResultDetailCard";
import Link from "next/link";

export default async function ParentResultDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const family=await loadParentFamily();
  const {id}=await params;
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))notFound();
  const supabase=await createClient();
  const ids=family.children.map(c=>c.id);
  if(!ids.length)notFound();
  // Explicit ownership check in addition to RLS. A URL ID cannot be used
  // to open another family's report or any unpublished result.
  const {data:authorization,error}=await supabase.from("results")
    .select("student_id").eq("id",id).eq("school_id",family.schoolId)
    .eq("status","PUBLISHED").in("student_id",ids).maybeSingle();
  if(error||!authorization)notFound();
  const found=await fetchResultDetail(supabase,id);
  if(!found)notFound();

  return <div className="space-y-5">
    <Link href={"/reports/"+id} className="inline-flex rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white">
      Print child&apos;s official report card
    </Link>
    <ResultDetailCard result={found.detail}/>
  </div>;
}
