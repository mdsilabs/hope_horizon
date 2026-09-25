/**
 * Seed script — creates one demo school with a full set of sample data:
 * a grading scale, an academic session/term, classes, subjects, and one
 * auth user + profile per role (admin, teacher, student, parent).
 *
 * Run with: npm run seed
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to be
 * set (see .env.example). Uses the service-role key because creating
 * auth users and inserting across multiple tables needs to bypass RLS —
 * never expose the service-role key to the browser.
 */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set. Copy .env.example to .env.local first."
  );
}

const supabase = createClient<Database>(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const DEFAULT_PASSWORD = "ChangeMe123!";

async function createAuthUser(
  email: string,
  name: string,
  role: Database["public"]["Tables"]["users"]["Row"]["role"],
  schoolId: string
) {
  // The on_auth_user_created trigger (0003_auth_sync_trigger.sql) copies
  // this metadata into public.users automatically.
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: DEFAULT_PASSWORD,
    email_confirm: true,
    user_metadata: { name, role, school_id: schoolId, must_change_password: true },
  });
  if (error || !data.user) throw new Error(`Failed to create auth user ${email}: ${error?.message}`);
  return data.user.id;
}

async function seed() {
  console.log("Seeding Hope Horizon Academy demo data...");

  const { data: school, error: schoolError } = await supabase
    .from("schools")
    .insert({
      name: "Hope Horizon Academy",
      levels: ["SECONDARY"],
      academic_structure_type: "TERM",
      academic_period_label: "Term",
      periods_per_session: 3,
      grading_scale: [
        { minScore: 70, maxScore: 100, grade: "A", remark: "Excellent" },
        { minScore: 60, maxScore: 69, grade: "B", remark: "Very Good" },
        { minScore: 50, maxScore: 59, grade: "C", remark: "Good" },
        { minScore: 45, maxScore: 49, grade: "D", remark: "Pass" },
        { minScore: 0, maxScore: 44, grade: "F", remark: "Fail" },
      ],
      ca_max_score: 40,
      exam_max_score: 60,
    })
    .select()
    .single();
  if (schoolError || !school) throw new Error(schoolError?.message || "Failed to create school");

  const { data: session, error: sessionError } = await supabase
    .from("academic_sessions")
    .insert({
      school_id: school.id,
      name: "2025/2026",
      start_date: "2025-09-01",
      end_date: "2026-07-31",
      is_current: true,
    })
    .select()
    .single();
  if (sessionError || !session) throw new Error(sessionError?.message || "Failed to create session");

  const { data: term, error: termError } = await supabase
    .from("terms")
    .insert({
      school_id: school.id,
      academic_session_id: session.id,
      name: "First Term",
      structure_type: "TERM",
      order: 1,
      start_date: "2025-09-01",
      end_date: "2025-12-12",
      is_current: true,
    })
    .select()
    .single();
  if (termError || !term) throw new Error(termError?.message || "Failed to create term");

  await supabase
    .from("schools")
    .update({ current_academic_session_id: session.id, current_term_id: term.id })
    .eq("id", school.id);

  const { data: mathSubject } = await supabase
    .from("subjects")
    .insert({ school_id: school.id, name: "Mathematics", code: "MATH" })
    .select()
    .single();
  const { data: engSubject } = await supabase
    .from("subjects")
    .insert({ school_id: school.id, name: "English Language", code: "ENG" })
    .select()
    .single();
  if (!mathSubject || !engSubject) throw new Error("Failed to create subjects");

  const { data: jss1, error: classError } = await supabase
    .from("classes")
    .insert({ school_id: school.id, name: "JSS 1", level: "SECONDARY", arm: "A", order: 1 })
    .select()
    .single();
  if (classError || !jss1) throw new Error(classError?.message || "Failed to create class");

  await supabase.from("class_subjects").insert([
    { class_id: jss1.id, subject_id: mathSubject.id },
    { class_id: jss1.id, subject_id: engSubject.id },
  ]);

  const adminUserId = await createAuthUser("admin@hopehorizon.test", "Amaka Okafor", "ADMIN", school.id);
  const teacherUserId = await createAuthUser("teacher@hopehorizon.test", "Chidi Eze", "TEACHER", school.id);
  const studentUserId = await createAuthUser("student@hopehorizon.test", "Ifeoma Nwosu", "STUDENT", school.id);
  const parentUserId = await createAuthUser("parent@hopehorizon.test", "Grace Nwosu", "PARENT", school.id);

  const { data: teacher, error: teacherError } = await supabase
    .from("teachers")
    .insert({ user_id: teacherUserId, school_id: school.id, full_name: "Chidi Eze", staff_id: "STF-0001" })
    .select()
    .single();
  if (teacherError || !teacher) throw new Error(teacherError?.message || "Failed to create teacher");

  await supabase.from("teacher_classes").insert({ teacher_id: teacher.id, class_id: jss1.id });
  await supabase
    .from("teacher_subject_assignments")
    .insert({ teacher_id: teacher.id, class_id: jss1.id, subject_id: mathSubject.id });
  await supabase.from("classes").update({ class_teacher_id: teacher.id }).eq("id", jss1.id);

  const { data: student, error: studentError } = await supabase
    .from("students")
    .insert({
      user_id: studentUserId,
      school_id: school.id,
      full_name: "Ifeoma Nwosu",
      admission_number: "HH/2025/0001",
      registration_number: "REG-0001",
      class_id: jss1.id,
      current_academic_session_id: session.id,
      gender: "FEMALE",
    })
    .select()
    .single();
  if (studentError || !student) throw new Error(studentError?.message || "Failed to create student");

  const { data: parent, error: parentError } = await supabase
    .from("parents")
    .insert({ user_id: parentUserId, school_id: school.id, full_name: "Grace Nwosu", email: "parent@hopehorizon.test" })
    .select()
    .single();
  if (parentError || !parent) throw new Error(parentError?.message || "Failed to create parent");

  await supabase.from("parent_students").insert({ parent_id: parent.id, student_id: student.id });

  console.log("\nSeed complete. Demo accounts (password for all: %s):", DEFAULT_PASSWORD);
  console.log("  Admin:   admin@hopehorizon.test");
  console.log("  Teacher: teacher@hopehorizon.test");
  console.log("  Student: student@hopehorizon.test");
  console.log("  Parent:  parent@hopehorizon.test");
  void adminUserId;
}

seed().catch((err) => {
  console.error("Seeding failed:", err);
  process.exit(1);
});
