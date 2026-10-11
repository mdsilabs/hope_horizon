import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentSession } from "@/lib/auth/getCurrentSession";
import { fetchResultDetail } from "@/services/resultQueries";
import { ResultDetailCard } from "@/components/results/ResultDetailCard";
import { ApprovalActions } from "@/components/results/ApprovalActions";
import { PublishHideActions } from "@/components/results/PublishHideActions";

export default async function AdminResultDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) redirect("/login");

  const { id } = await params;
  const supabase = await createClient();
  const found = await fetchResultDetail(supabase, id);
  if (!found) notFound();

  const { detail } = found;
  const {data:scope}=await supabase.from("results").select("class_id,term_id").eq("id",id).single();
  const compiled=scope ? (await supabase.from("class_result_batches").select("id")
    .eq("class_id",scope.class_id).eq("term_id",scope.term_id).maybeSingle()).data : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-slate-900">Result</h1>
        <p className="mt-1 text-sm text-slate-500">Full detail and available actions for this result.</p>
      </div>

      <ResultDetailCard result={detail} />

      {detail.status === "PENDING_APPROVAL" && !compiled && (
        <ApprovalActions resultId={id} backHref="/admin/results" />
      )}

      {compiled&&<div className="rounded-xl border border-brand-200 bg-brand-50 p-4 text-sm text-brand-800">
        This student belongs to a compiled class. For approval or returns, review the complete class.
        <Link href="/admin/class-approvals" className="ml-1 font-semibold underline">Class Approvals</Link>
      </div>}
      <PublishHideActions
        resultId={id}
        status={detail.status}
        backHref="/admin/results"
        canHide={session.profile.role === "ADMIN"}
      />
    </div>
  );
}
