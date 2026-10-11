/**
 * Local-only, one-time first administrator provisioning.
 * This script is NOT an API route or publicly accessible website.
 * Called from Bootstrap-Admin.ps1 with a JSON payload on stdin.
 * Sensitive inputs and privileged API keys are never logged or persisted.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { firstAdminSetupSchema } from "../lib/validations/first-admin";
import { getPublicSupabaseConfig, SUPABASE_PROJECT_REF } from "../lib/supabase/config";
import type { Database } from "../types/database";

type BootstrapResult = { status: "created" | "blocked" | "error"; message: string; email?: string; schoolName?: string; projectRef?: string };
function reply(result: BootstrapResult): void {
  process.stdout.write(JSON.stringify(result) + "\n");
}
function errorText(value: unknown): string {
  return value instanceof Error ? value.message : "Unknown setup error.";
}

async function main() {
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key || !(key.startsWith("sb_secret_") || key.startsWith("eyJ"))) {
    reply({ status:"error", message:"Enter a new Supabase secret key in the setup wizard. A service-role key is supported as a legacy fallback." });
    process.exitCode = 1;
    return;
  }
  let input: ReturnType<typeof firstAdminSetupSchema.parse>;
  try {
    input = firstAdminSetupSchema.parse(JSON.parse(readFileSync(0, "utf8")));
  } catch {
    reply({ status:"error", message:"Invalid setup input. Enter a name, valid email and password with 12+ characters, upper/lowercase letters, numbers and symbols." });
    process.exitCode = 1;
    return;
  }

  let supabaseUrl: string;
  try {
    supabaseUrl = getPublicSupabaseConfig().url;
  } catch {
    reply({ status:"error", message:"Project URL mismatch. This tool only provisions the pinned Hope Horizon Supabase project." });
    process.exitCode = 1;
    return;
  }
  const db = createClient<Database>(supabaseUrl, key, {
    auth: { autoRefreshToken:false, persistSession:false, detectSessionInUrl:false },
  });
  let newSchoolId: string | null = null;
  let newAuthUserId: string | null = null;
  try {
    // Do not allow an unauthenticated first-admin setup to be run twice.
    const { data: existingAdmins, error: adminsError } = await db.from("users")
      .select("id").eq("role","ADMIN").limit(1);
    if (adminsError) throw new Error("Cannot read administrator profiles. Confirm migrations and permissions.");
    if ((existingAdmins?.length ?? 0) > 0) {
      reply({ status:"blocked", message:"An administrator already exists. Sign in with that account or use Forgot password. No additional admin was created." });
      return;
    }

    const { data: schools, error: schoolsError } = await db.from("schools")
      .select("id,name").order("created_at",{ascending:true}).limit(100);
    if (schoolsError) throw new Error("Cannot read school records. Confirm SQL migrations 0001–0005 are installed.");

    let school: { id:string; name:string };
    if (input.schoolId) {
      const selected = schools?.find(s=>s.id===input.schoolId);
      if (!selected) throw new Error("The selected school ID does not exist in this project.");
      school=selected;
    } else if (!schools?.length) {
      const result = await db.from("schools").insert({
        name: input.schoolName,
        levels: ["SECONDARY"],
        academic_structure_type: "TERM",
        academic_period_label: "Term",
        periods_per_session: 3,
        ca_max_score: 40,
        exam_max_score: 60,
        grading_scale: [
          { minScore:70,maxScore:100,grade:"A",remark:"Excellent" },
          { minScore:60,maxScore:69,grade:"B",remark:"Very Good" },
          { minScore:50,maxScore:59,grade:"C",remark:"Good" },
          { minScore:45,maxScore:49,grade:"D",remark:"Pass" },
          { minScore:0,maxScore:44,grade:"F",remark:"Fail" },
        ],
      }).select("id,name").single();
      if (result.error || !result.data) throw new Error("Could not create the first school. Check the database installation.");
      school = result.data;
      newSchoolId = school.id;
    } else if (schools.length === 1) {
      school=schools[0];
    } else {
      throw new Error("Several schools already exist. Enter the intended school's UUID in the School ID field.");
    }

    const { data: auth, error: createError } = await db.auth.admin.createUser({
      email: input.adminEmail,
      password: input.adminPassword,
      email_confirm: true,
      user_metadata: { name: input.adminName },
      app_metadata: { school_id:school.id, role:"ADMIN", admin_tier:"PRIMARY", must_change_password:false },
    });
    if (createError || !auth.user) {
      throw new Error("Admin authentication account was not created. Check for an existing email and confirm migration 0004 is installed.");
    }
    newAuthUserId=auth.user.id;

    const { data: profile, error: verifyError } = await db.from("users")
      .select("id,school_id,role,is_active").eq("id",auth.user.id).maybeSingle();
    if (verifyError || !profile || profile.role !== "ADMIN" || profile.school_id !== school.id || !profile.is_active) {
      throw new Error("Account profile verification failed. Confirm migration 0004's authentication trigger is installed.");
    }

    reply({
      status:"created", message:"First administrator created and verified. Open the portal /login page and use your chosen email and password.",
      email:input.adminEmail, schoolName:school.name, projectRef:SUPABASE_PROJECT_REF,
    });
    // Mark successful so no cleanup can remove the newly-created account.
    newAuthUserId=null;
    newSchoolId=null;
  } catch (error) {
    let cleanupFailed=false;
    if (newAuthUserId) {
      const removed = await db.auth.admin.deleteUser(newAuthUserId);
      if (removed.error) cleanupFailed=true;
    }
    if (newSchoolId && !cleanupFailed) {
      const removed=await db.from("schools").delete().eq("id",newSchoolId);
      if (removed.error) cleanupFailed=true;
    }
    reply({ status:"error",
      message:errorText(error) + (cleanupFailed ? " Cleanup could not be verified; check Supabase Auth and school records manually." : "") });
    process.exitCode=1;
  }
}
void main().catch(()=>{
  reply({status:"error",message:"Unexpected setup failure. Check Supabase availability and database permissions."});
  process.exitCode=1;
});
