import { NextResponse, type NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/requireSession";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { uuidString } from "@/lib/validations/common";
import { studentAccountSchema } from "@/lib/validations/family-accounts";
import { generateUnusedPassword, requireProvisioningSecurity, requestSetupEmail } from "@/lib/admin/account-onboarding";
import { AppError, ConflictError, NotFoundError, handleApiError } from "@/lib/utils/errors";

/** Provision a login for an ALREADY enrolled student; never create a duplicate student. */
export async function POST(request: NextRequest, {params}: {params:Promise<{id:string}>}) {
  try {
    const session=await requireRole(["ADMIN"]);
    const studentId=uuidString.parse((await params).id);
    const {email}=studentAccountSchema.parse(await request.json());
    const db=await createClient();
    const schoolId=session.profile.school_id;
    const {data:student,error:readError}=await db.from("students")
      .select("id,full_name,is_active,user_id").eq("id",studentId)
      .eq("school_id",schoolId).maybeSingle();
    if(readError) throw readError;
    if(!student) throw new NotFoundError("Student record not found.");
    if(!student.is_active) throw new ConflictError("Reactivate the student before enabling login.");
    if(student.user_id) throw new ConflictError("This student already has a portal account. Use Resend setup email.");

    await requireProvisioningSecurity();
    const admin=createAdminClient();
    const {data:created,error:createError}=await admin.auth.admin.createUser({
      email, password:generateUnusedPassword(), email_confirm:true,
      user_metadata:{name:student.full_name},
      app_metadata:{school_id:schoolId,role:"STUDENT",must_change_password:true},
    });
    if(createError||!created.user) {
      throw new ConflictError("Account could not be created. This email may already have a portal account.");
    }

    try {
      const {data:profile,error:profileError}=await db.from("users")
        .select("id,school_id,role,is_active").eq("id",created.user.id).maybeSingle();
      if(profileError || !profile || profile.school_id!==schoolId || profile.role!=="STUDENT" || !profile.is_active)
        throw new Error("Student authentication profile verification failed.");

      // Conditional update avoids replacing a link created by another request.
      const {data:linked,error:linkError}=await db.from("students")
        .update({user_id:created.user.id}).eq("id",studentId).eq("school_id",schoolId)
        .eq("is_active",true).is("user_id",null).select("id").maybeSingle();
      if(linkError || !linked) throw new Error("Student account could not be linked; retry after checking account status.");
    } catch {
      const {error:cleanupError}=await admin.auth.admin.deleteUser(created.user.id);
      if(cleanupError) console.error("New student Auth account cleanup requires review.");
      throw new AppError("Could not complete student login setup. Confirm migration 0006 is installed; check for an orphaned Auth user if retry fails.",500);
    }

    const {error:auditError}=await db.from("audit_logs").insert({
      school_id:schoolId,user_id:session.authUserId,action:"STUDENT_UPDATED",
      entity_type:"student",entity_id:studentId,metadata:{operation:"portal_login_created"},
    });
    if(auditError) console.error("Student login provisioning audit failed.");
    const emailStatus=await requestSetupEmail(admin,email);
    return NextResponse.json({emailStatus,
      message:emailStatus==="requested"
        ?"Student portal login created. Password-setup email requested; confirm delivery."
        :"Student portal login created, but email was not requested. Configure Supabase Auth SMTP and NEXT_PUBLIC_APP_URL, then resend."},
      {status:201});
  } catch(e){return handleApiError(e);}
}
