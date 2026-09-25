import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentSession } from "@/lib/auth/getCurrentSession";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/States";
import { ResultStatusBadge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils/cn";
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from "@/components/ui/Table";
import type { ResultStatus } from "@/types/database";

const TABS: { label: string; value: ResultStatus | "ALL" }[] = [
  { label: "All", value: "ALL" },
  { label: "Pending approval", value: "PENDING_APPROVAL" },
  { label: "Approved", value: "APPROVED" },
  { label: "Published", value: "PUBLISHED" },
  { label: "Draft", value: "DRAFT" },
  { label: "Hidden", value: "HIDDEN" },
];

export default async function AdminResultsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await getCurrentSession();
  if (!session) redirect("/login");

  const { status } = await searchParams;
  const activeStatus = (status as ResultStatus | undefined) ?? "ALL";

  const supabase = await createClient();
  let query = supabase
    .from("results")
    .select("id, status, overall_total, overall_average, updated_at, students(full_name, admission_number), classes(name)")
    .eq("school_id", session.profile.school_id)
    .order("updated_at", { ascending: false })
    .limit(100);

  if (activeStatus !== "ALL") query = query.eq("status", activeStatus);

  const { data: results } = await query;

  type Row = {
    id: string;
    status: ResultStatus;
    overall_total: number | null;
    overall_average: number | null;
    updated_at: string;
    students: { full_name: string; admission_number: string } | null;
    classes: { name: string } | null;
  };
  const rows = (results ?? []) as unknown as Row[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-slate-900">Results</h1>
        <p className="mt-1 text-sm text-slate-500">Every result across the school, at every stage.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((tab) => (
          <Link
            key={tab.value}
            href={tab.value === "ALL" ? "/admin/results" : `/admin/results?status=${tab.value}`}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
              activeStatus === tab.value
                ? "bg-brand-500 text-white"
                : "bg-white text-slate-600 border border-surface-border hover:bg-surface-muted"
            )}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader title={`${rows.length} result(s)`} />
        {rows.length === 0 ? (
          <EmptyState title="No results here" description="Nothing matches this filter yet." />
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
                  <TableCell className="font-medium text-slate-900">
                    {r.students?.full_name}
                    <span className="ml-2 text-xs text-slate-400">{r.students?.admission_number}</span>
                  </TableCell>
                  <TableCell>{r.classes?.name}</TableCell>
                  <TableCell>{r.overall_total ?? "—"}</TableCell>
                  <TableCell>{r.overall_average ?? "—"}</TableCell>
                  <TableCell>
                    <ResultStatusBadge status={r.status} />
                  </TableCell>
                  <TableCell>
                    <Link href={`/admin/results/${r.id}`} className="text-sm font-medium text-brand-600 hover:underline">
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
