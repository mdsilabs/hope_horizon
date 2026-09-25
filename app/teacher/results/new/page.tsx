import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentSession } from "@/lib/auth/getCurrentSession";
import { ResultForm, type ClassOption, type StudentOption } from "@/components/teacher/ResultForm";
import { Alert } from "@/components/ui/Alert";

export default async function NewResultPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");

  const supabase = await createClient();
  const schoolId = session.profile.school_id;

  const { data: school } = await supabase
    .from("schools")
    .select("current_academic_session_id, current_term_id")
    .eq("id", schoolId)
    .single();

  if (!school?.current_academic_session_id || !school?.current_term_id) {
    return (
      <Alert variant="warning" title="No active academic session">
        Your school administrator needs to set the current academic session and term before
        results can be entered.
      </Alert>
    );
  }

  // Elevated roles (admin/principal/VP) may enter or correct a result for
  // any class — for simplicity in this scaffold they're offered every
  // class in the school, subjects included.
  const isElevated = ["ADMIN", "PRINCIPAL", "VICE_PRINCIPAL"].includes(session.profile.role);

  let classIds: string[] = [];
  let classTeacherClassIds = new Set<string>();
  let subjectAssignments: { classId: string; subjectId: string }[] = [];

  if (isElevated) {
    const { data: allClasses } = await supabase.from("classes").select("id").eq("school_id", schoolId);
    classIds = (allClasses ?? []).map((c) => c.id);
  } else {
    const { data: teacher } = await supabase
      .from("teachers")
      .select("id")
      .eq("user_id", session.authUserId)
      .eq("school_id", schoolId)
      .maybeSingle();

    if (!teacher) {
      return (
        <Alert variant="warning" title="No teacher profile linked">
          Ask your school administrator to link your account to a teacher profile before you can
          enter results.
        </Alert>
      );
    }

    const [{ data: classTeacherRows }, { data: assignmentRows }] = await Promise.all([
      supabase.from("teacher_classes").select("class_id").eq("teacher_id", teacher.id),
      supabase.from("teacher_subject_assignments").select("class_id, subject_id").eq("teacher_id", teacher.id),
    ]);

    classTeacherClassIds = new Set((classTeacherRows ?? []).map((r) => r.class_id));
    subjectAssignments = (assignmentRows ?? []).map((r) => ({ classId: r.class_id, subjectId: r.subject_id }));
    classIds = Array.from(new Set([...classTeacherClassIds, ...subjectAssignments.map((a) => a.classId)]));
  }

  if (classIds.length === 0) {
    return (
      <Alert variant="warning" title="No classes assigned">
        You aren&apos;t currently assigned to any class or subject. Ask your school administrator
        to set up your assignments.
      </Alert>
    );
  }

  const { data: classRows } = await supabase
    .from("classes")
    .select("id, name, class_subjects(subjects(id, name, code))")
    .in("id", classIds);

  const { data: studentRows } = await supabase
    .from("students")
    .select("id, full_name, admission_number, class_id")
    .in("class_id", classIds)
    .eq("is_active", true)
    .order("full_name");

  type ClassSubjectRow = { subjects: { id: string; name: string; code: string } | null };
  const classes: ClassOption[] = (classRows ?? []).map((c) => {
    const allSubjectsForClass = (c.class_subjects as unknown as ClassSubjectRow[])
      .map((cs) => cs.subjects)
      .filter((s): s is { id: string; name: string; code: string } => !!s);

    const subjects = isElevated || classTeacherClassIds.has(c.id)
      ? allSubjectsForClass
      : allSubjectsForClass.filter((s) =>
          subjectAssignments.some((a) => a.classId === c.id && a.subjectId === s.id)
        );

    return { id: c.id, name: c.name, subjects };
  });

  const studentsByClass: Record<string, StudentOption[]> = {};
  for (const s of studentRows ?? []) {
    const list = studentsByClass[s.class_id] ?? [];
    list.push({ id: s.id, fullName: s.full_name, admissionNumber: s.admission_number });
    studentsByClass[s.class_id] = list;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-slate-900">Enter a result</h1>
        <p className="mt-1 text-sm text-slate-500">
          Scores are saved as a draft until you submit them for approval.
        </p>
      </div>
      <ResultForm
        mode="create"
        classes={classes}
        studentsByClass={studentsByClass}
        academicSessionId={school.current_academic_session_id}
        termId={school.current_term_id}
      />
    </div>
  );
}
