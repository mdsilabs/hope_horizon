import { redirect } from "next/navigation";
import { ClipboardCheck } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentSession } from "@/lib/auth/getCurrentSession";
import { StatCard } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/States";
import { Button } from "@/components/ui/Button";

export default async function StudentDashboardPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: student } = await supabase
    .from("students")
    .select("id, class_id, classes(name)")
    .eq("user_id", session.authUserId)
    .eq("school_id", session.profile.school_id)
    .maybeSingle();

  const publishedCount = student
    ? await supabase
        .from("results")
        .select("*", { count: "exact", head: true })
        .eq("student_id", student.id)
        .eq("status", "PUBLISHED")
        .then((r) => r.count ?? 0)
    : 0;

  const className = (student as unknown as { classes?: { name?: string } })?.classes?.name;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-slate-900">
          Hello, {session.profile.name.split(" ")[0]}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {student ? `Class: ${className ?? "—"}` : "Your student profile is not yet linked."}
        </p>
      </div>

      {student ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <StatCard
            label="Published results"
            value={publishedCount}
            icon={<ClipboardCheck className="h-5 w-5" />}
          />
        </div>
      ) : (
        <EmptyState
          title="No student profile linked"
          description="Ask your school administrator to link your account to your student record."
        />
      )}

      <div>
        <Link href="/student/results">
          <Button variant="secondary">View my results</Button>
        </Link>
      </div>
    </div>
  );
}
