import Link from "next/link";
import { redirect } from "next/navigation";
import { PlusCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentSession } from "@/lib/auth/getCurrentSession";
import { Card, CardHeader } from "@/components/ui/Card";
import { ResultStatusBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/States";
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from "@/components/ui/Table";

export default async function TeacherResultsPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: results } = await supabase
    .from("results")
    .select("id, status, overall_total, overall_average, rejection_reason, updated_at, students(full_name), classes(name)")
    .eq("entered_by", session.authUserId)
    .order("updated_at", { ascending: false });

  const { data: teacher } = await supabase
    .from("teachers")
    .select("id")
    .eq("user_id", session.authUserId)
    .eq("school_id", session.profile.school_id)
    .maybeSingle();

  type ResultRow = {
    id: string;
    status: string;
    overall_total: number | null;
    overall_average: number | null;
    rejection_reason: string | null;
    updated_at: string;
    students: { full_name: string } | null;
    classes: { name: string } | null;
  };
  const rows = (results ?? []) as unknown as ResultRow[];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Results I've entered"
          description="Drafts, submissions, and any results sent back for correction."
          action={
            teacher && (
              <Link href="/teacher/results/new">
                <Button size="sm">
                  <PlusCircle className="h-4 w-4" />
                  New result
                </Button>
              </Link>
            )
          }
        />

        {rows.length === 0 ? (
          <EmptyState
            title="No results yet"
            description="Once you enter a student's scores, they'll appear here."
            action={
              teacher && (
                <Link href="/teacher/results/new">
                  <Button size="sm" variant="secondary" className="mt-2">
                    Enter your first result
                  </Button>
                </Link>
              )
            }
          />
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Student</TableHeaderCell>
                <TableHeaderCell>Class</TableHeaderCell>
                <TableHeaderCell>Total</TableHeaderCell>
                <TableHeaderCell>Average</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium text-slate-900">{r.students?.full_name}</TableCell>
                  <TableCell>{r.classes?.name}</TableCell>
                  <TableCell>{r.overall_total ?? "—"}</TableCell>
                  <TableCell>{r.overall_average ?? "—"}</TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <ResultStatusBadge status={r.status as never} />
                      {r.rejection_reason && (
                        <span className="text-xs text-danger-500">{r.rejection_reason}</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Link href={`/teacher/results/${r.id}`} className="text-sm font-medium text-brand-600 hover:underline">
                      {r.status === "DRAFT" ? "Continue editing" : "View"}
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
