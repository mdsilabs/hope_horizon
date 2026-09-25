import { redirect } from "next/navigation";
import { FileCheck2, ClipboardCheck } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentSession } from "@/lib/auth/getCurrentSession";
import { StatCard } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

export default async function PrincipalDashboardPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const schoolId = session.profile.school_id;

  const [pendingCount, publishedCount] = await Promise.all([
    supabase
      .from("results")
      .select("*", { count: "exact", head: true })
      .eq("school_id", schoolId)
      .eq("status", "PENDING_APPROVAL")
      .then((r) => r.count ?? 0),
    supabase
      .from("results")
      .select("*", { count: "exact", head: true })
      .eq("school_id", schoolId)
      .eq("status", "PUBLISHED")
      .then((r) => r.count ?? 0),
  ]);

  const basePath = session.profile.role === "VICE_PRINCIPAL" ? "/vice-principal" : "/principal";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-slate-900">
          Welcome, {session.profile.name.split(" ")[0]}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Review and approve results awaiting sign-off.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard label="Pending your approval" value={pendingCount} icon={<FileCheck2 className="h-5 w-5" />} />
        <StatCard label="Published this term" value={publishedCount} icon={<ClipboardCheck className="h-5 w-5" />} />
      </div>

      <Link href={`${basePath}/approvals`}>
        <Button>Go to approvals queue</Button>
      </Link>
    </div>
  );
}
