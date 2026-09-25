import { redirect } from "next/navigation";
import { GraduationCap, Users, ClipboardCheck, FileCheck2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentSession } from "@/lib/auth/getCurrentSession";
import { StatCard } from "@/components/ui/Card";

export default async function AdminDashboardPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const schoolId = session.profile.school_id;

  const [studentCount, teacherCount, pendingApprovalCount, publishedCount] = await Promise.all([
    supabase
      .from("students")
      .select("*", { count: "exact", head: true })
      .eq("school_id", schoolId)
      .eq("is_active", true)
      .then((r) => r.count ?? 0),
    supabase
      .from("teachers")
      .select("*", { count: "exact", head: true })
      .eq("school_id", schoolId)
      .eq("is_active", true)
      .then((r) => r.count ?? 0),
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-slate-900">
          Welcome back, {session.profile.name.split(" ")[0]}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Here&apos;s what&apos;s happening across the school today.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Active students" value={studentCount} icon={<GraduationCap className="h-5 w-5" />} />
        <StatCard label="Active teachers" value={teacherCount} icon={<Users className="h-5 w-5" />} />
        <StatCard
          label="Pending approval"
          value={pendingApprovalCount}
          icon={<FileCheck2 className="h-5 w-5" />}
        />
        <StatCard
          label="Published results"
          value={publishedCount}
          icon={<ClipboardCheck className="h-5 w-5" />}
        />
      </div>
    </div>
  );
}
