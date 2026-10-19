import Link from "next/link";
import { redirect } from "next/navigation";
import { BookOpen, ClipboardCheck, GraduationCap } from "lucide-react";
import { getCurrentSession } from "@/lib/auth/getCurrentSession";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/States";

type LinkedClass = {
  id: string;
  school_id: string;
  name: string;
  arm: string | null;
  level: string;
  is_active: boolean;
};
type LinkedSubject = {
  id: string;
  name: string;
  code: string;
  is_active: boolean;
};
type ClassTeacherLink = { class_id: string; classes: LinkedClass | null };
type SubjectTeacherLink = {
  class_id: string;
  subject_id: string;
  classes: LinkedClass | null;
  subjects: LinkedSubject | null;
};
type ClassOverview = {
  classroom: LinkedClass;
  classTeacher: boolean;
  subjects: LinkedSubject[];
};

export default async function TeacherClassesPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  if (session.profile.role !== "TEACHER") redirect("/");

  const db = await createClient();
  const schoolId = session.profile.school_id;
  const { data: teacher, error: teacherError } = await db
    .from("teachers")
    .select("id")
    .eq("user_id", session.authUserId)
    .eq("school_id", schoolId)
    .eq("is_active", true)
    .maybeSingle();

  if (teacherError) return (
    <Card><p role="alert" className="text-sm text-red-700">Could not load your teacher profile. Please try again later.</p></Card>
  );

  if (!teacher) return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold text-slate-900">My classes</h1>
      <EmptyState
        title="No teacher profile assigned"
        description="Ask your school administrator to link your account with an active teacher profile."
      />
    </div>
  );

  // Get class-teacher and subject-teacher assignments separately. A teacher
  // may teach a subject without also being the assigned class teacher.
  const [classResult, subjectResult] = await Promise.all([
    db.from("teacher_classes")
      .select("class_id,classes(id,school_id,name,arm,level,is_active)")
      .eq("teacher_id", teacher.id),
    db.from("teacher_subject_assignments")
      .select("class_id,subject_id,classes(id,school_id,name,arm,level,is_active),subjects(id,name,code,is_active)")
      .eq("teacher_id", teacher.id),
  ]);

  if (classResult.error || subjectResult.error) return (
    <Card><p role="alert" className="text-sm text-red-700">Could not load your class assignments. Please try again or contact the school administrator.</p></Card>
  );

  const byId = new Map<string,ClassOverview>();
  function getOrAdd(classroom: LinkedClass | null): ClassOverview | null {
    if (!classroom || !classroom.is_active || classroom.school_id !== schoolId) return null;
    const existing = byId.get(classroom.id);
    if (existing) return existing;
    const overview:ClassOverview = {classroom,classTeacher:false,subjects:[]};
    byId.set(classroom.id,overview);
    return overview;
  }

  for (const row of (classResult.data??[]) as unknown as ClassTeacherLink[]) {
    const overview = getOrAdd(row.classes);
    if (overview) overview.classTeacher = true;
  }
  for (const row of (subjectResult.data??[]) as unknown as SubjectTeacherLink[]) {
    const overview = getOrAdd(row.classes);
    if (overview && row.subjects?.is_active &&
        !overview.subjects.some(s=>s.id===row.subjects!.id)) {
      overview.subjects.push(row.subjects);
    }
  }

  const overviews = Array.from(byId.values()).sort((a,b)=>
    (a.classroom.name+" "+(a.classroom.arm??"")).localeCompare(
      b.classroom.name+" "+(b.classroom.arm??"")
    )
  );

  // Counts only: no student contact information or private records are
  // included in the class overview. RLS and the active school scope apply.
  const counts = await Promise.all(overviews.map(async row=>{
    const {count,error} = await db.from("students")
      .select("id",{count:"exact",head:true})
      .eq("school_id",schoolId)
      .eq("class_id",row.classroom.id)
      .eq("is_active",true);
    return {id:row.classroom.id,count:error?null:count};
  }));
  const countById = new Map(counts.map(row=>[row.id,row.count]));

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <p className="text-sm font-semibold text-brand-700">Teacher workspace</p>
        <h1 className="mt-1 font-display text-2xl font-semibold text-slate-900">My classes</h1>
        <p className="mt-1 text-sm text-slate-600">
          See your class-teacher responsibilities and teaching subjects. Open the subject markbook to record scores or the class review to compile results.
        </p>
      </div>

      {overviews.length===0 ? (
        <EmptyState
          title="No active class assignments"
          description="Ask your school administrator to assign a class or a subject to your teacher profile."
        />
      ) : (
        <>
          <p className="text-sm text-slate-500">
            {overviews.length} assigned {overviews.length===1?"class":"classes"} ·
            {" "}{overviews.filter(row=>row.classTeacher).length} class-teacher responsibilities
          </p>
          <div className="grid gap-4 lg:grid-cols-2">
            {overviews.map(({classroom,classTeacher,subjects})=>(
              <Card key={classroom.id} className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium text-slate-500">{classroom.level}</p>
                    <h2 className="text-lg font-semibold text-slate-900">
                      {classroom.name}{classroom.arm?" "+classroom.arm:""}
                    </h2>
                  </div>
                  <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700">
                    {classTeacher?"Class teacher":"Subject teacher"}
                  </span>
                </div>

                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <GraduationCap className="h-4 w-4"/>
                  {countById.get(classroom.id)??"—"} active students
                </div>

                <div>
                  <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <BookOpen className="h-4 w-4"/> My assigned subjects
                  </div>
                  {subjects.length ? (
                    <div className="space-y-2">
                      {subjects.sort((a,b)=>a.name.localeCompare(b.name)).map(subject=>(
                        <div key={subject.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50 p-3">
                          <div>
                            <p className="text-sm font-medium text-slate-800">{subject.name}</p>
                            <p className="text-xs text-slate-500">{subject.code}</p>
                          </div>
                          <Link
                            href={`/teacher/markbook?classId=${encodeURIComponent(classroom.id)}&subjectId=${encodeURIComponent(subject.id)}`}
                            className="text-sm font-medium text-brand-700 hover:underline"
                          >
                            Open markbook
                          </Link>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500">No subjects assigned directly to you in this class.</p>
                  )}
                </div>

                {classTeacher&&(
                  <Link href={`/teacher/compilation/${encodeURIComponent(classroom.id)}`}
                    className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700">
                    <ClipboardCheck className="h-4 w-4"/> Review class results
                  </Link>
                )}
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
