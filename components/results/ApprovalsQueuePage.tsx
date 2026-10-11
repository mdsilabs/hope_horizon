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
    .select("id, class_id, term_id, overall_total, submitted_at, students(full_name, admission_number), classes(name)")
    .eq("school_id", session.profile.school_id)
    .eq("status", "PENDING_APPROVAL")
    .order("submitted_at", { ascending: true });

  const {data:compiledBatches} = await supabase.from("class_result_batches")
    .select("class_id,term_id").eq("school_id",session.profile.school_id)
    .eq("status","PENDING_APPROVAL");
  const compiledKeys=new Set((compiledBatches??[]).map(b=>b.class_id+":"+b.term_id));
  type Row = {
    class_id: string; term_id: string;
    id: string;
    overall_total: number | null;
    submitted_at: string | null;
    students: { full_name: string; admission_number: string } | null;
    classes: { name: string } | null;
  };
  const rows = ((results ?? []) as unknown as Row[]).filter(r=>!compiledKeys.has(r.class_id+":"+r.term_id));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-slate-900">Approvals queue</h1>
        <p className="mt-1 text-sm text-slate-500">
          Legacy per-student results only. Compiled class results are reviewed together in Class Approvals.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link href={basePath+"/class-approvals"}
          className="rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600">
          Review compiled classes
        </Link>
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
