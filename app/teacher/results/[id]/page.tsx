import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentSession } from "@/lib/auth/getCurrentSession";
import { fetchResultDetail } from "@/services/resultQueries";
import { ResultDetailCard } from "@/components/results/ResultDetailCard";
import { ResultForm, type ClassOption, type StudentOption } from "@/components/teacher/ResultForm";
import { Alert } from "@/components/ui/Alert";

export default async function TeacherResultDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session) redirect("/login");

  const { id } = await params;
  const supabase = await createClient();
  const found = await fetchResultDetail(supabase, id);
  if (!found) notFound();

  const { detail, enteredBy } = found;
  const isOwner = enteredBy === session.authUserId;

  if (detail.status !== "DRAFT" || !isOwner) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl font-semibold text-slate-900">Result</h1>
          <p className="mt-1 text-sm text-slate-500">
            {isOwner
              ? "This result has already been submitted and can no longer be edited directly."
              : "You can only edit results you entered."}
          </p>
        </div>
        <ResultDetailCard result={detail} />
      </div>
    );
  }

  // Editable draft — rebuild the class/subject/student options this
  // teacher is authorized to use, exactly as the "new result" page does.
  const { data: rawResult } = await supabase
    .from("results")
    .select(
      "class_id, student_id, academic_session_id, term_id, teacher_remarks, result_subject_scores(subject_id, ca, exam)"
    )
    .eq("id", id)
    .single();

  if (!rawResult) notFound();

  const isElevated = ["ADMIN", "PRINCIPAL", "VICE_PRINCIPAL"].includes(session.profile.role);
  let allowedSubjectIds: Set<string> | null = null;

  if (!isElevated) {
    const { data: teacher } = await supabase
      .from("teachers")
      .select("id")
      .eq("user_id", session.authUserId)
      .eq("school_id", session.profile.school_id)
      .maybeSingle();

    const isClassTeacher = teacher
      ? !!(
          await supabase
            .from("teacher_classes")
            .select("class_id")
            .eq("teacher_id", teacher.id)
            .eq("class_id", rawResult.class_id)
            .maybeSingle()
        ).data
      : false;

    if (teacher && !isClassTeacher) {
      const { data: assignments } = await supabase
        .from("teacher_subject_assignments")
        .select("subject_id")
        .eq("teacher_id", teacher.id)
        .eq("class_id", rawResult.class_id);
      allowedSubjectIds = new Set((assignments ?? []).map((a) => a.subject_id));
    }
  }

  const { data: classRow } = await supabase
    .from("classes")
    .select("id, name, class_subjects(subjects(id, name, code))")
    .eq("id", rawResult.class_id)
    .single();

  const { data: studentRow } = await supabase
    .from("students")
    .select("id, full_name, admission_number")
    .eq("id", rawResult.student_id)
    .single();

  if (!classRow || !studentRow) {
    return <Alert variant="danger">This result&apos;s class or student record could not be found.</Alert>;
  }

  type ClassSubjectRow = { subjects: { id: string; name: string; code: string } | null };
  const allSubjects = (classRow.class_subjects as unknown as ClassSubjectRow[])
    .map((cs) => cs.subjects)
    .filter((s): s is { id: string; name: string; code: string } => !!s);
  const subjects = allowedSubjectIds ? allSubjects.filter((s) => allowedSubjectIds!.has(s.id)) : allSubjects;

  const classes: ClassOption[] = [{ id: classRow.id, name: classRow.name, subjects }];
  const studentsByClass: Record<string, StudentOption[]> = {
    [classRow.id]: [
      { id: studentRow.id, fullName: studentRow.full_name, admissionNumber: studentRow.admission_number },
    ],
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-slate-900">Edit result</h1>
        <p className="mt-1 text-sm text-slate-500">{studentRow.full_name}</p>
      </div>
      <ResultForm
        mode="edit"
        resultId={id}
        classes={classes}
        studentsByClass={studentsByClass}
        academicSessionId={rawResult.academic_session_id}
        termId={rawResult.term_id}
        initial={{
          classId: rawResult.class_id,
          studentId: rawResult.student_id,
          teacherRemarks: rawResult.teacher_remarks ?? undefined,
          scores: rawResult.result_subject_scores.map((s) => ({
            subjectId: s.subject_id,
            ca: s.ca,
            exam: s.exam,
          })),
        }}
      />
    </div>
  );
}
