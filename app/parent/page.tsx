import { redirect } from "next/navigation";
import { GraduationCap } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentSession } from "@/lib/auth/getCurrentSession";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/States";

export default async function ParentDashboardPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: parent } = await supabase
    .from("parents")
    .select("id")
    .eq("user_id", session.authUserId)
    .eq("school_id", session.profile.school_id)
    .maybeSingle();

  const children = parent
    ? (
        await supabase
          .from("parent_students")
          .select("students(id, full_name, admission_number)")
          .eq("parent_id", parent.id)
      ).data?.map((row) => (row as unknown as { students: { id: string; full_name: string; admission_number: string } }).students) ?? []
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-slate-900">
          Welcome, {session.profile.name.split(" ")[0]}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Track your {children.length === 1 ? "child's" : "children's"} academic progress here.
        </p>
      </div>

      {children.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {children.map((child) => (
            <Card key={child.id} className="flex items-center gap-3">
              <div className="rounded-xl bg-brand-50 p-3 text-brand-600">
                <GraduationCap className="h-5 w-5" />
              </div>
              <div>
                <p className="font-medium text-slate-900">{child.full_name}</p>
                <p className="text-sm text-slate-500">Admission No: {child.admission_number}</p>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          title="No children linked to your account"
          description="Ask your school administrator to link your account to your child/children's student records."
        />
      )}
    </div>
  );
}
