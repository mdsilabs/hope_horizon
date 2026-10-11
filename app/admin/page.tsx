import { redirect } from "next/navigation";
import Link from "next/link";
import { GraduationCap, Users, ClipboardCheck, FileCheck2, ArrowRight, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentSession } from "@/lib/auth/getCurrentSession";
import { StatCard } from "@/components/ui/Card";
import { readSchoolSetup } from "@/lib/admin/read-school-setup";

export default async function AdminDashboardPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  if (session.profile.role !== "ADMIN") redirect("/");

  const supabase = await createClient();
  const schoolId = session.profile.school_id;
  const setup = await readSchoolSetup(schoolId);
  const nextStep = setup.steps.find(step => !step.done);

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

      <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-surface-border bg-white p-5 shadow-sm">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {setup.ready && <CheckCircle2 className="h-5 w-5 text-emerald-600"/>}
            <h2 className="font-semibold text-slate-900">{setup.ready ? "School setup complete" : "Finish your school setup"}</h2>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            {setup.complete} of {setup.total} steps complete.
            {nextStep ? ` Next: ${nextStep.title}.` : " Review integration checks before publishing results."}
          </p>
          <div role="progressbar" aria-valuenow={setup.complete} aria-valuemin={0} aria-valuemax={setup.total}
            aria-label="School setup progress" className="mt-3 h-2 max-w-lg overflow-hidden rounded-full bg-slate-100">
            <div className="h-full bg-brand-500" style={{width:`${Math.round(setup.complete/setup.total*100)}%`}}/>
          </div>
        </div>
        <Link href="/admin/setup"
          className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-600">
          {setup.ready ? "Review setup" : "Continue setup"} <ArrowRight className="h-4 w-4"/>
        </Link>
      </section>

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
