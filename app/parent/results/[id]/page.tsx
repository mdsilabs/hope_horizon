import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentSession } from "@/lib/auth/getCurrentSession";
import { fetchResultDetail } from "@/services/resultQueries";
import { ResultDetailCard } from "@/components/results/ResultDetailCard";
import Link from "next/link";

export default async function ParentResultDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) redirect("/login");

  const { id } = await params;
  const supabase = await createClient();
  // RLS ensures this only succeeds for a PUBLISHED result of a linked child.
  const found = await fetchResultDetail(supabase, id);
  if (!found) notFound();

  return <div className="space-y-5">
    <Link href={"/reports/"+id} className="inline-flex rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white">
      Print child&apos;s official report card
    </Link>
    <ResultDetailCard result={found.detail}/>
  </div>;
}
