import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentSession } from "@/lib/auth/getCurrentSession";
import { fetchResultDetail } from "@/services/resultQueries";
import { ResultDetailCard } from "@/components/results/ResultDetailCard";
import { ApprovalActions } from "@/components/results/ApprovalActions";
import { PublishHideActions } from "@/components/results/PublishHideActions";
import { Alert } from "@/components/ui/Alert";

export default async function ApprovalDetailPage({
  resultId,
  basePath,
}: {
  resultId: string;
  basePath: string;
}) {
  const session = await getCurrentSession();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const found = await fetchResultDetail(supabase, resultId);
  if (!found) notFound();

  const { detail } = found;
  const {data:scope}=await supabase.from("results")
    .select("class_id,term_id").eq("id",resultId).single();
  const compiled=scope ? (await supabase.from("class_result_batches").select("id")
    .eq("class_id",scope.class_id).eq("term_id",scope.term_id).maybeSingle()).data : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-slate-900">Review result</h1>
        <p className="mt-1 text-sm text-slate-500">
          Check the scores below before approving or sending them back.
        </p>
      </div>

      <ResultDetailCard result={detail} />

      {detail.status === "PENDING_APPROVAL" && !compiled && (
        <ApprovalActions resultId={resultId} backHref={`${basePath}/approvals`} />
      )}

      {compiled&&<div className="rounded-xl border border-brand-200 bg-brand-50 p-4 text-sm text-brand-800">
        This result belongs to a class compilation. Review and approve the entire class instead.
        <Link className="ml-1 font-semibold underline" href={basePath+"/class-approvals"}>
          Open Class Approvals
        </Link>
      </div>}
      <PublishHideActions resultId={resultId} status={detail.status} backHref={`${basePath}/approvals`} canHide={false} />

      {detail.status !== "PENDING_APPROVAL" && detail.status !== "APPROVED" && (
        <Alert variant="info">This result is no longer awaiting your action.</Alert>
      )}
    </div>
  );
}
