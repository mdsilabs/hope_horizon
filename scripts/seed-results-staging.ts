/**
 * Dedicated STAGING project only. First apply supabase/staging/qa_results_fixture.sql.
 * Provision 5 subject teachers, 1 class teacher, 1 principal, 10 students
 * and 10 parents with the SAME password provided privately via env.
 * No password or Supabase secret is committed or printed.
 *
 * ALLOW_STAGING_SEED=true EXPECTED_STAGING_PROJECT_REF=<staging ref>
 * STAGING_TEST_PASSWORD=<temporary shared password> npx tsx scripts/seed-results-staging.ts
 */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const requireEnv = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
};
async function main() {
  if (process.env.ALLOW_STAGING_SEED !== "true") throw new Error("Set ALLOW_STAGING_SEED=true for dedicated staging only.");
  const url = requireEnv("STAGING_SUPABASE_URL");
  const ref = new URL(url).hostname.split(".")[0];
  if (ref !== requireEnv("EXPECTED_STAGING_PROJECT_REF")) throw new Error("Staging Supabase project mismatch.");
  // Known Hope Horizon production reference must never be used for this fixture.
  if (ref === "iwfpdwihinhcwjgvmfei") throw new Error("Refusing to seed Hope Horizon's pinned production Supabase project.");
  const password = requireEnv("STAGING_TEST_PASSWORD");
  if (password.length < 12 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) ||
      !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
    throw new Error("Shared staging password needs 12+ characters and upper/lowercase, digits and symbol.");
  }
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("A staging-only server-side Supabase secret key is required.");
  const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: schools, error: schoolError } = await db.from("schools").select("id,name");
  if (schoolError || !schools || schools.length !== 1 || schools[0].name !== "Hope Horizon QA STAGING") {
    throw new Error("Refusing to run: the database must contain exactly one QA STAGING school.");
  }
  const schoolId = schools[0].id;
  const { data: classes, error: classError } = await db.from("classes").select("id,name").eq("school_id",schoolId);
  const cls = classes?.find(c => c.name === "JSS 1 QA");
  if (classError || !cls || classes?.length !== 1) throw new Error("Expected the sole JSS 1 QA staging class.");
  const { data: sessions } = await db.from("academic_sessions").select("id").eq("school_id",schoolId);
  const { data: subjects, error: subjectsError } = await db.from("subjects").select("id,code").eq("school_id",schoolId);
  if (!sessions || sessions.length !== 1 || subjectsError || !subjects || subjects.length !== 5) throw new Error("Staging academic fixture incomplete.");
  const { data: existingUsers, error: existingError } = await db.from("users").select("id").eq("school_id",schoolId).limit(1);
  if (existingError || existingUsers?.length) throw new Error("QA test users already exist. Refusing to create duplicates.");

  async function account(role: "PRINCIPAL" | "TEACHER" | "STUDENT" | "PARENT",name: string,email: string) {
    const { data,error } = await db.auth.admin.createUser({
      email,password,email_confirm:true,user_metadata:{name},
      app_metadata:{school_id:schoolId,role,must_change_password:false},
    });
    if (error || !data.user) throw new Error(`Account creation failed for ${email}: ${error?.message}`);
    return data.user.id;
  }
  const domain = "example.test";
  const principalId = await account("PRINCIPAL","QA Principal",`qa.principal@${domain}`);
  const classTeacherId = await account("TEACHER","QA Class Teacher",`qa.class.teacher@${domain}`);
  const {data:ct,error:ctError}=await db.from("teachers").insert({
    user_id:classTeacherId,school_id:schoolId,full_name:"QA Class Teacher",staff_id:"QA-CT-001"
  }).select("id").single();
  if(ctError || !ct)throw new Error(`Class teacher profile: ${ctError?.message}`);
  const {error:tcError}=await db.from("teacher_classes").insert({teacher_id:ct.id,class_id:cls.id});
  if(tcError)throw tcError;
  const {error:classAssignError}=await db.from("classes").update({class_teacher_id:ct.id}).eq("id",cls.id);
  if(classAssignError)throw classAssignError;
  for(const sub of subjects.sort((a,b)=>a.code.localeCompare(b.code))){
    const teacherUserId=await account("TEACHER",`QA ${sub.code} Teacher`,`qa.teacher.${sub.code.toLowerCase()}@${domain}`);
    const {data:t,error:te}=await db.from("teachers").insert({
      user_id:teacherUserId,school_id:schoolId,full_name:`QA ${sub.code} Teacher`,staff_id:`QA-${sub.code}`
    }).select("id").single();
    if(te||!t)throw new Error(`Teacher setup for ${sub.code}: ${te?.message}`);
    const {error:ae}=await db.from("teacher_subject_assignments").insert({
      teacher_id:t.id,class_id:cls.id,subject_id:sub.id
    });
    if(ae)throw ae;
  }
  for(let i=1;i<=10;i++){
    const n=String(i).padStart(2,"0");
    const studentName=`QA Student ${n}`,parentName=`QA Parent ${n}`;
    const stuUserId=await account("STUDENT",studentName,`qa.student.${n}@${domain}`);
    const {data:student,error:se}=await db.from("students").insert({
      user_id:stuUserId,school_id:schoolId,full_name:studentName,
      admission_number:`QA/2026/${n}`,registration_number:`QA-REG-${n}`,
      class_id:cls.id,current_academic_session_id:sessions[0].id,gender:i%2?"FEMALE":"MALE",
    }).select("id").single();
    if(se||!student)throw new Error(`Student ${n}: ${se?.message}`);
    const pUserId=await account("PARENT",parentName,`qa.parent.${n}@${domain}`);
    const {data:parent,error:pe}=await db.from("parents").insert({
      user_id:pUserId,school_id:schoolId,full_name:parentName,email:`qa.parent.${n}@${domain}`
    }).select("id").single();
    if(pe||!parent)throw new Error(`Parent ${n}: ${pe?.message}`);
    const {error:linkError}=await db.from("parent_students").insert({parent_id:parent.id,student_id:student.id});
    if(linkError)throw linkError;
  }
  void principalId;
  console.log("QA staging fixture ready: 1 principal, 5 subject teachers, 1 class teacher, 10 students and 10 linked parents.");
  console.log("Login email format: qa.principal@example.test, qa.class.teacher@example.test, qa.teacher.<code>@example.test, qa.student.01@example.test ... qa.parent.10@example.test");
  console.log("Password read from STAGING_TEST_PASSWORD (not displayed). Enter scores via the app to exercise the actual result workflow.");
}
main().catch(e=>{ console.error(e instanceof Error ? e.message : "Staging seeding failed");process.exitCode=1; });
