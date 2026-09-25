import { notFound, redirect } from "next/navigation";
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-slate-900">Review result</h1>
        <p className="mt-1 text-sm text-slate-500">
          Check the scores below before approving or sending them back.
        </p>
      </div>

      <ResultDetailCard result={detail} />

      {detail.status === "PENDING_APPROVAL" && (
        <ApprovalActions resultId={resultId} backHref={`${basePath}/approvals`} />
      )}

      <PublishHideActions resultId={resultId} status={detail.status} backHref={`${basePath}/approvals`} canHide={false} />

      {detail.status !== "PENDING_APPROVAL" && detail.status !== "APPROVED" && (
        <Alert variant="info">This result is no longer awaiting your action.</Alert>
      )}
    </div>
  );
}
