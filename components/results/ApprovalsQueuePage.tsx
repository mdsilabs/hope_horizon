import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentSession } from "@/lib/auth/getCurrentSession";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/States";
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";

export default async function ApprovalsQueuePage({ basePath }: { basePath: string }) {
  const session = await getCurrentSession();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const { data: results } = await supabase
    .from("results")
    .select("id, overall_total, submitted_at, students(full_name, admission_number), classes(name)")
    .eq("school_id", session.profile.school_id)
    .eq("status", "PENDING_APPROVAL")
    .order("submitted_at", { ascending: true });

  type Row = {
    id: string;
    overall_total: number | null;
    submitted_at: string | null;
    students: { full_name: string; admission_number: string } | null;
    classes: { name: string } | null;
  };
  const rows = (results ?? []) as unknown as Row[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-slate-900">Approvals queue</h1>
        <p className="mt-1 text-sm text-slate-500">
          Results submitted by teachers, waiting for your review.
        </p>
      </div>

      <Card>
        <CardHeader title={`${rows.length} awaiting approval`} />
        {rows.length === 0 ? (
          <EmptyState title="Nothing to review" description="You're all caught up." />
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Student</TableHeaderCell>
                <TableHeaderCell>Class</TableHeaderCell>
                <TableHeaderCell>Total</TableHeaderCell>
                <TableHeaderCell>Submitted</TableHeaderCell>
                <TableHeaderCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium text-slate-900">
                    {r.students?.full_name}
                    <span className="ml-2 text-xs text-slate-400">{r.students?.admission_number}</span>
                  </TableCell>
                  <TableCell>{r.classes?.name}</TableCell>
                  <TableCell>{r.overall_total ?? "—"}</TableCell>
                  <TableCell>
                    {r.submitted_at ? (
                      <Badge variant="brand">{new Date(r.submitted_at).toLocaleDateString()}</Badge>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>
                    <Link href={`${basePath}/approvals/${r.id}`} className="text-sm font-medium text-brand-600 hover:underline">
                      Review
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
