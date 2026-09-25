import { redirect } from "next/navigation";
import { GraduationCap, Wallet } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentSession } from "@/lib/auth/getCurrentSession";
import { StatCard } from "@/components/ui/Card";
import { Alert } from "@/components/ui/Alert";

export default async function AccountantDashboardPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { count: studentCount } = await supabase
    .from("students")
    .select("*", { count: "exact", head: true })
    .eq("school_id", session.profile.school_id)
    .eq("is_active", true);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-slate-900">
          Welcome, {session.profile.name.split(" ")[0]}
        </h1>
        <p className="mt-1 text-sm text-slate-500">Billing and student records overview.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard label="Active students" value={studentCount ?? 0} icon={<GraduationCap className="h-5 w-5" />} />
        <StatCard label="Billing module" value="—" icon={<Wallet className="h-5 w-5" />} />
      </div>

      <Alert variant="info" title="Billing not yet configured">
        The billing/fees module is a placeholder in this build — wire it up to your school&apos;s
        preferred payment provider when ready.
      </Alert>
    </div>
  );
}
