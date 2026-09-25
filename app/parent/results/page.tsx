import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentSession } from "@/lib/auth/getCurrentSession";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/States";
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from "@/components/ui/Table";

export default async function ParentResultsPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");

  const supabase = await createClient();

  // RLS restricts this to PUBLISHED results of this parent's linked
  // children only (supabase/migrations/0002_rls_policies.sql).
  const { data: results } = await supabase
    .from("results")
    .select(
      "id, overall_total, overall_average, overall_position, published_at, students(full_name), classes(name), terms(name), academic_sessions(name)"
    )
    .order("published_at", { ascending: false });

  type Row = {
    id: string;
    overall_total: number | null;
    overall_average: number | null;
    overall_position: number | null;
    students: { full_name: string } | null;
    classes: { name: string } | null;
    terms: { name: string } | null;
    academic_sessions: { name: string } | null;
  };
  const rows = (results ?? []) as unknown as Row[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-slate-900">Results</h1>
        <p className="mt-1 text-sm text-slate-500">Published results for your linked children.</p>
      </div>

      <Card>
        <CardHeader title={`${rows.length} published result(s)`} />
        {rows.length === 0 ? (
          <EmptyState
            title="No results published yet"
            description="Check back once the school has finalized this term's results."
          />
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Child</TableHeaderCell>
                <TableHeaderCell>Session / Term</TableHeaderCell>
                <TableHeaderCell>Class</TableHeaderCell>
                <TableHeaderCell>Average</TableHeaderCell>
                <TableHeaderCell>Position</TableHeaderCell>
                <TableHeaderCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium text-slate-900">{r.students?.full_name}</TableCell>
                  <TableCell>
                    {r.academic_sessions?.name} — {r.terms?.name}
                  </TableCell>
                  <TableCell>{r.classes?.name}</TableCell>
                  <TableCell>{r.overall_average ?? "—"}</TableCell>
                  <TableCell>{r.overall_position ?? "—"}</TableCell>
                  <TableCell>
                    <Link href={`/parent/results/${r.id}`} className="text-sm font-medium text-brand-600 hover:underline">
                      View
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
