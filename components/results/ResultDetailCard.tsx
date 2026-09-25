import { ResultStatusBadge } from "@/components/ui/Badge";
import { Card, CardHeader } from "@/components/ui/Card";
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from "@/components/ui/Table";
import type { ResultStatus } from "@/types/database";

export interface ResultDetailData {
  id: string;
  status: ResultStatus;
  studentName: string;
  admissionNumber?: string;
  className: string;
  sessionName?: string;
  termName?: string;
  overallTotal?: number | null;
  overallAverage?: number | null;
  overallPosition?: number | null;
  teacherRemarks?: string | null;
  principalRemarks?: string | null;
  rejectionReason?: string | null;
  subjects: { subjectName: string; subjectCode: string; ca: number; exam: number; total: number; grade?: string | null }[];
  submittedAt?: string | null;
  approvedAt?: string | null;
  publishedAt?: string | null;
}

function formatDate(value?: string | null): string | null {
  if (!value) return null;
  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function ResultDetailCard({ result }: { result: ResultDetailData }) {
  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{result.studentName}</h2>
            <p className="mt-0.5 text-sm text-slate-500">
              {result.className}
              {result.admissionNumber ? ` · ${result.admissionNumber}` : ""}
              {result.sessionName ? ` · ${result.sessionName}` : ""}
              {result.termName ? ` · ${result.termName}` : ""}
            </p>
          </div>
          <ResultStatusBadge status={result.status} />
        </div>

        {result.rejectionReason && (
          <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-danger-500">
            <span className="font-medium">Sent back for correction:</span> {result.rejectionReason}
          </p>
        )}

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">Overall total</p>
            <p className="text-xl font-semibold text-slate-900">{result.overallTotal ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">Average</p>
            <p className="text-xl font-semibold text-slate-900">{result.overallAverage ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">Class position</p>
            <p className="text-xl font-semibold text-slate-900">{result.overallPosition ?? "—"}</p>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Subject scores" />
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell>Subject</TableHeaderCell>
              <TableHeaderCell>CA</TableHeaderCell>
              <TableHeaderCell>Exam</TableHeaderCell>
              <TableHeaderCell>Total</TableHeaderCell>
              <TableHeaderCell>Grade</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {result.subjects.map((s) => (
              <TableRow key={s.subjectCode}>
                <TableCell className="font-medium text-slate-900">{s.subjectName}</TableCell>
                <TableCell>{s.ca}</TableCell>
                <TableCell>{s.exam}</TableCell>
                <TableCell>{s.total}</TableCell>
                <TableCell>{s.grade ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {(result.teacherRemarks || result.principalRemarks) && (
        <Card>
          <CardHeader title="Remarks" />
          <div className="space-y-3 text-sm">
            {result.teacherRemarks && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Teacher</p>
                <p className="mt-0.5 text-slate-700">{result.teacherRemarks}</p>
              </div>
            )}
            {result.principalRemarks && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Approver</p>
                <p className="mt-0.5 text-slate-700">{result.principalRemarks}</p>
              </div>
            )}
          </div>
        </Card>
      )}

      {(result.submittedAt || result.approvedAt || result.publishedAt) && (
        <Card>
          <CardHeader title="Timeline" />
          <ul className="space-y-2 text-sm text-slate-600">
            {formatDate(result.submittedAt) && <li>Submitted for approval — {formatDate(result.submittedAt)}</li>}
            {formatDate(result.approvedAt) && <li>Approved — {formatDate(result.approvedAt)}</li>}
            {formatDate(result.publishedAt) && <li>Published — {formatDate(result.publishedAt)}</li>}
          </ul>
        </Card>
      )}
    </div>
  );
}
