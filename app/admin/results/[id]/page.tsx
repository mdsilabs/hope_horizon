import { notFound, redirect } from "next/navigation";
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-slate-900">Result</h1>
        <p className="mt-1 text-sm text-slate-500">Full detail and available actions for this result.</p>
      </div>

      <ResultDetailCard result={detail} />

      {detail.status === "PENDING_APPROVAL" && (
        <ApprovalActions resultId={id} backHref="/admin/results" />
      )}

      <PublishHideActions
        resultId={id}
        status={detail.status}
        backHref="/admin/results"
        canHide={session.profile.role === "ADMIN"}
      />
    </div>
  );
}
