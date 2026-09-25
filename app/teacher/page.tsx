import { BookOpen, ClipboardCheck, ClipboardList } from "lucide-react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentSession } from "@/lib/auth/getCurrentSession";
import { StatCard } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/States";

export default async function TeacherDashboardPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: teacher } = await supabase
    .from("teachers")
    .select("id")
    .eq("user_id", session.authUserId)
    .eq("school_id", session.profile.school_id)
    .maybeSingle();

  let assignedClassCount = 0;
  let subjectAssignmentCount = 0;
  let draftCount = 0;
  let submittedCount = 0;

  if (teacher) {
    const [classes, assignments, drafts, submitted] = await Promise.all([
      supabase.from("teacher_classes").select("*", { count: "exact", head: true }).eq("teacher_id", teacher.id),
      supabase
        .from("teacher_subject_assignments")
        .select("*", { count: "exact", head: true })
        .eq("teacher_id", teacher.id),
      supabase
        .from("results")
        .select("*", { count: "exact", head: true })
        .eq("entered_by", session.authUserId)
        .eq("status", "DRAFT"),
      supabase
        .from("results")
        .select("*", { count: "exact", head: true })
        .eq("entered_by", session.authUserId)
        .in("status", ["SUBMITTED", "PENDING_APPROVAL"]),
    ]);
    assignedClassCount = classes.count ?? 0;
    subjectAssignmentCount = assignments.count ?? 0;
    draftCount = drafts.count ?? 0;
    submittedCount = submitted.count ?? 0;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-slate-900">
          Welcome back, {session.profile.name.split(" ")[0]}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {teacher
            ? `You're assigned to ${assignedClassCount} class(es) and ${subjectAssignmentCount} subject assignment(s).`
            : "Your teacher profile hasn't been set up yet — contact your administrator."}
        </p>
      </div>

      {teacher ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard label="Draft results" value={draftCount} icon={<BookOpen className="h-5 w-5" />} />
          <StatCard
            label="Awaiting approval"
            value={submittedCount}
            icon={<ClipboardCheck className="h-5 w-5" />}
          />
          <StatCard
            label="Subject assignments"
            value={subjectAssignmentCount}
            icon={<ClipboardList className="h-5 w-5" />}
          />
        </div>
      ) : (
        <EmptyState
          title="No teacher profile found"
          description="Ask your school administrator to link your account to a teacher profile and class/subject assignments."
        />
      )}
    </div>
  );
}
