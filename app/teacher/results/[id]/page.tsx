import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentSession } from "@/lib/auth/getCurrentSession";
import { fetchResultDetail } from "@/services/resultQueries";
import { ResultDetailCard } from "@/components/results/ResultDetailCard";
import Link from "next/link";
import { Alert } from "@/components/ui/Alert";

export default async function TeacherResultDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) redirect("/login");

  const { id } = await params;
  const supabase = await createClient();
  const found = await fetchResultDetail(supabase, id);
  if (!found) notFound();

  const { detail, enteredBy } = found;
  const isOwner = enteredBy === session.authUserId;

  if (detail.status !== "DRAFT" || !isOwner) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl font-semibold text-slate-900">Result</h1>
          <p className="mt-1 text-sm text-slate-500">
            {isOwner
              ? "This result has already been submitted and can no longer be edited directly."
              : "You can only edit results you entered."}
          </p>
        </div>
        <ResultDetailCard result={detail} />
      </div>
    );
  }

  return <div className="space-y-5">
    <ResultDetailCard result={detail}/>
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
      Per-student draft editing has been replaced by the subject markbook to prevent
      one teacher from overwriting another subject teacher's scores.
      <Link className="ml-1 font-medium text-brand-700 underline" href="/teacher/markbook">
        Open Subject Markbook
      </Link>
    </div>
  </div>;
}
