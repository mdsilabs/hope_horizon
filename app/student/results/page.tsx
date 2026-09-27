import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentSession } from "@/lib/auth/getCurrentSession";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/States";
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from "@/components/ui/Table";

export default async function StudentResultsPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");

  const supabase = await createClient();

  // RLS already restricts this query to the caller's own PUBLISHED
  // results (supabase/migrations/0002_rls_policies.sql), so no extra
  // filtering is needed here.
  const { data: results } = await supabase
    .from("results")
    .select("id, overall_total, overall_average, overall_position, published_at, classes(name), terms(name), academic_sessions(name)")
    .order("published_at", { ascending: false });

  type Row = {
    id: string;
    overall_total: number | null;
    overall_average: number | null;
    overall_position: number | null;
    published_at: string | null;
    classes: { name: string } | null;
    terms: { name: string } | null;
    academic_sessions: { name: string } | null;
  };
  const rows = (results ?? []) as unknown as Row[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-slate-900">My results</h1>
        <p className="mt-1 text-sm text-slate-500">Published results appear here as soon as they are released.</p>
      </div>

      <Card>
        <CardHeader title={`${rows.length} published result(s)`} />
        {rows.length === 0 ? (
          <EmptyState
            title="No results published yet"
            description="Check back once your teachers and school have finalized this term's results."
          />
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Session / Term</TableHeaderCell>
                <TableHeaderCell>Class</TableHeaderCell>
                <TableHeaderCell>Total</TableHeaderCell>
                <TableHeaderCell>Average</TableHeaderCell>
                <TableHeaderCell>Position</TableHeaderCell>
                <TableHeaderCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium text-slate-900">
                    {r.academic_sessions?.name} — {r.terms?.name}
                  </TableCell>
                  <TableCell>{r.classes?.name}</TableCell>
                  <TableCell>{r.overall_total ?? "—"}</TableCell>
                  <TableCell>{r.overall_average ?? "—"}</TableCell>
                  <TableCell>{r.overall_position ?? "—"}</TableCell>
                  <TableCell>
                    <Link href={`/student/results/${r.id}`} className="text-sm font-medium text-brand-600 hover:underline">
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
