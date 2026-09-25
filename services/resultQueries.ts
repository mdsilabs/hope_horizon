import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { ResultDetailData } from "@/components/results/ResultDetailCard";

type RawResultRow = {
  id: string;
  status: ResultDetailData["status"];
  overall_total: number | null;
  overall_average: number | null;
  overall_position: number | null;
  teacher_remarks: string | null;
  principal_remarks: string | null;
  rejection_reason: string | null;
  submitted_at: string | null;
  approved_at: string | null;
  published_at: string | null;
  entered_by: string;
  students: { full_name: string; admission_number: string } | null;
  classes: { name: string } | null;
  academic_sessions: { name: string } | null;
  terms: { name: string } | null;
  result_subject_scores: {
    ca: number;
    exam: number;
    total: number;
    grade: string | null;
    subjects: { name: string; code: string } | null;
  }[];
};

/**
 * Fetches one result with every relation needed to render
 * <ResultDetailCard>. Returns null if the result doesn't exist OR the
 * caller's Row Level Security policies don't permit reading it — the two
 * cases are indistinguishable by design, so callers should treat a null
 * return as "not found" rather than probing further.
 */
export async function fetchResultDetail(
  supabase: SupabaseClient<Database>,
  resultId: string
): Promise<{ detail: ResultDetailData; enteredBy: string } | null> {
  const { data, error } = await supabase
    .from("results")
    .select(
      `id, status, overall_total, overall_average, overall_position,
       teacher_remarks, principal_remarks, rejection_reason,
       submitted_at, approved_at, published_at, entered_by,
       students(full_name, admission_number),
       classes(name),
       academic_sessions(name),
       terms(name),
       result_subject_scores(ca, exam, total, grade, subjects(name, code))`
    )
    .eq("id", resultId)
    .single();

  if (error || !data) return null;

  const row = data as unknown as RawResultRow;

  return {
    enteredBy: row.entered_by,
    detail: {
      id: row.id,
      status: row.status,
      studentName: row.students?.full_name ?? "Unknown student",
      admissionNumber: row.students?.admission_number,
      className: row.classes?.name ?? "—",
      sessionName: row.academic_sessions?.name,
      termName: row.terms?.name,
      overallTotal: row.overall_total,
      overallAverage: row.overall_average,
      overallPosition: row.overall_position,
      teacherRemarks: row.teacher_remarks,
      principalRemarks: row.principal_remarks,
      rejectionReason: row.rejection_reason,
      submittedAt: row.submitted_at,
      approvedAt: row.approved_at,
      publishedAt: row.published_at,
      subjects: row.result_subject_scores.map((s) => ({
        subjectName: s.subjects?.name ?? "Unknown subject",
        subjectCode: s.subjects?.code ?? "",
        ca: s.ca,
        exam: s.exam,
        total: s.total,
        grade: s.grade,
      })),
    },
  };
}
