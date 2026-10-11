import { NextResponse, type NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/requireSession";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parentCreateSchema } from "@/lib/validations/family-accounts";
import { requireProvisioningSecurity, generateUnusedPassword, requestSetupEmail } from "@/lib/admin/account-onboarding";
import { AppError, ConflictError, handleApiError } from "@/lib/utils/errors";

export async function GET() {
  try {
    const session=await requireRole(["ADMIN"]);
    const db=await createClient();
    const {data,error}=await db.from("parents")
      .select("id,full_name,phone,email,is_active,user_id,users(email,is_active),parent_students(student_id,students(id,full_name,admission_number,is_active))")
      .eq("school_id",session.profile.school_id)
      .order("full_name",{ascending:true}).limit(200);
    if(error)throw error;
    return NextResponse.json({parents:data??[]});
  } catch(e){return handleApiError(e);}
}

export async function POST(request:NextRequest) {
  try {
    const session=await requireRole(["ADMIN"]);
    const input=parentCreateSchema.parse(await request.json());
    const db=await createClient(),schoolId=session.profile.school_id;
    const {data:students,error:studentsError}=await db.from("students").select("id")
      .eq("school_id",schoolId).eq("is_active",true).in("id",input.studentIds);
    if(studentsError)throw studentsError;
    if(students?.length!==input.studentIds.length)throw new AppError("Choose active students belonging to your school only.",422);
    await requireProvisioningSecurity();
    const admin=createAdminClient();
    const {data:created,error:createError}=await admin.auth.admin.createUser({
      email:input.email,password:generateUnusedPassword(),email_confirm:true,
      user_metadata:{name:input.fullName},
      app_metadata:{school_id:schoolId,role:"PARENT",must_change_password:true},
    });
    if(createError||!created.user)throw new ConflictError("This email may already have a portal account.");
    let parentId:string|null=null;
    try {
      const {data:profile,error:profileError}=await db.from("users")
        .select("id,role,school_id,is_active").eq("id",created.user.id).maybeSingle();
      if(profileError||!profile || profile.role!=="PARENT" || profile.school_id!==schoolId || !profile.is_active)
        throw new Error("Parent Auth account could not be verified.");
      const {data:parent,error:parentError}=await db.from("parents").insert({
        user_id:created.user.id,school_id:schoolId,
        full_name:input.fullName, email:input.email,phone:input.phone||null,
      }).select("id").single();
      if(parentError || !parent)throw new Error("Parent record could not be created.");
      parentId=parent.id;
      // Requires migration 0006; one atomic transaction validates all selected children.
      const {data:linked,error:linkError}=await db.rpc("hh_admin_replace_parent_children",{
        p_parent_id:parentId,p_student_ids:input.studentIds,
      });
      if(linkError || linked!==true)throw new Error("Child linking failed.");
    } catch {
      const {error:cleanupError}=await admin.auth.admin.deleteUser(created.user.id);
      if(cleanupError)console.error("New parent Auth account cleanup requires manual review.");
      throw new AppError("Parent account setup could not finish. Apply family migration 0006 and check the student links before retrying.",503);
    }
    const {error:auditError}=await db.from("audit_logs").insert({
      school_id:schoolId,user_id:session.authUserId,action:"SYSTEM_SETTING_CHANGED",
      entity_type:"parent",entity_id:parentId,
      metadata:{operation:"parent_account_created",child_count:input.studentIds.length},
    });
    if(auditError)console.error("Parent account audit failed.");
    const emailStatus=await requestSetupEmail(admin,input.email);
    return NextResponse.json({parentId,emailStatus,
      message:emailStatus==="requested"
        ?"Parent account created with linked children. Password-setup email requested; verify delivery."
        :"Parent account created with linked children. Email was not requested; configure Supabase Auth SMTP and resend."},
      {status:201});
  }catch(e){return handleApiError(e);}
}
