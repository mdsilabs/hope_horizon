import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentSession } from "@/lib/auth/getCurrentSession";
import { fetchResultDetail } from "@/services/resultQueries";
import { ResultDetailCard } from "@/components/results/ResultDetailCard";

export default async function ParentResultDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) redirect("/login");

  const { id } = await params;
  const supabase = await createClient();
  // RLS ensures this only succeeds for a PUBLISHED result of a linked child.
  const found = await fetchResultDetail(supabase, id);
  if (!found) notFound();

  return <ResultDetailCard result={found.detail} />;
}
