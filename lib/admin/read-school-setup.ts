import "server-only";
import { createClient } from "@/lib/supabase/server";
import { buildSetupSteps } from "./setup-progress";

export async function readSchoolSetup(schoolId: string) {
  const db = await createClient();
  const [school, classes, classSubjects, teacherSubjects, students] = await Promise.all([
    db.from("schools").select("id,name,contact_email,contact_phone,current_academic_session_id,current_term_id")
      .eq("id", schoolId).single(),
    db.from("classes").select("id", { count: "exact", head: true })
      .eq("school_id", schoolId).eq("is_active", true),
    // Use inner joins to ensure only active classes/teachers from this school count.
    db.from("class_subjects").select("class_id,classes!inner(school_id,is_active)", { count: "exact", head: true })
      .eq("classes.school_id", schoolId).eq("classes.is_active", true),
    db.from("teacher_subject_assignments").select("teacher_id,teachers!inner(school_id,is_active)", { count: "exact", head: true })
      .eq("teachers.school_id", schoolId).eq("teachers.is_active", true),
    db.from("students").select("id", { count: "exact", head: true })
      .eq("school_id", schoolId).eq("is_active", true),
  ]);
  for (const result of [school, classes, classSubjects, teacherSubjects, students]) {
    if (result.error) throw new Error("School setup could not be loaded. Check migrations and school permissions.");
  }
  if (!school.data) throw new Error("The administrator's school could not be found.");
  const steps = buildSetupSteps({
    hasContact: Boolean(school.data.contact_email || school.data.contact_phone),
    hasAcademicPeriod: Boolean(school.data.current_academic_session_id && school.data.current_term_id),
    classCount: classes.count ?? 0,
    assignedSubjectCount: classSubjects.count ?? 0,
    assignedTeacherCount: teacherSubjects.count ?? 0,
    studentCount: students.count ?? 0,
  });
  const complete = steps.filter(s => s.done).length;
  return {
    schoolName: school.data.name,
    steps,
    complete,
    total: steps.length,
    ready: complete === steps.length,
  };
}
