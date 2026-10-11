import { NextResponse, type NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/requireSession";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { coAdminCreateSchema } from "@/lib/validations/co-admin";
import { generateUnusedPassword, requestSetupEmail, requireProvisioningSecurity } from "@/lib/admin/account-onboarding";
import { AppError, ConflictError, handleApiError } from "@/lib/utils/errors";

export async function GET(){
  try{
    const session=await requireRole(["ADMIN"]);
    const db=await createClient();
    const {data,error}=await db.from("users")
      .select("id,name,email,admin_tier,is_active,last_login_at,created_at")
      .eq("school_id",session.profile.school_id).eq("role","ADMIN")
      .order("created_at",{ascending:true}).limit(200);
    if(error)throw error;
    if(data?.some(user=>!user.admin_tier))
      throw new AppError("Run migration 0008 to enable Co-Admin management.",503,"MIGRATION_REQUIRED");
    return NextResponse.json({administrators:data??[],currentUserId:session.authUserId});
  }catch(error){return handleApiError(error);}
}

export async function POST(request:NextRequest){
  try{
    const session=await requireRole(["ADMIN"]);
    const {fullName,email}=coAdminCreateSchema.parse(await request.json());
    const db=await createClient(),schoolId=session.profile.school_id;
    await requireProvisioningSecurity();
    // Fail closed if migration 0008 (tier + deletion guard) is absent.
    const {data:owner,error:ownerError}=await db.from("users")
      .select("id,admin_tier").eq("school_id",schoolId).eq("role","ADMIN")
      .eq("admin_tier","PRIMARY").eq("is_active",true).limit(1);
    if(ownerError || !owner?.length)
      throw new AppError("A protected primary admin is required. Apply migration 0008.",503,"MIGRATION_REQUIRED");

    const admin=createAdminClient();
    const {data:created,error:createError}=await admin.auth.admin.createUser({
      email,password:generateUnusedPassword(),email_confirm:true,
      user_metadata:{name:fullName},
      app_metadata:{
        school_id:schoolId,role:"ADMIN",admin_tier:"CO_ADMIN",must_change_password:true,
      },
    });
    if(createError || !created.user)
      throw new ConflictError("Unable to create this Co-Admin. Check whether the email already belongs to another account.");

    const id=created.user.id;
    try{
      const {data:profile,error:profileError}=await db.from("users")
        .select("id,school_id,role,admin_tier,is_active")
        .eq("id",id).eq("school_id",schoolId).maybeSingle();
      if(profileError || !profile || profile.role!=="ADMIN" ||
         profile.admin_tier!=="CO_ADMIN" || !profile.is_active)
        throw new Error("Co-Admin role verification failed.");
    }catch{
      const {error:cleanupError}=await admin.auth.admin.deleteUser(id);
      if(cleanupError)console.error("Co-Admin signup cleanup failed; check the Auth users table.");
      throw new AppError("Co-Admin provisioning could not be verified. Confirm migration 0008 and review Supabase Auth.",503);
    }

    const {error:auditError}=await db.from("audit_logs").insert({
      school_id:schoolId,user_id:session.authUserId,action:"SYSTEM_SETTING_CHANGED",
      entity_type:"co_admin",entity_id:id,metadata:{operation:"co_admin_created",setupMethod},
    });
    if(auditError)console.error("Co-Admin creation audit failed.");
    const emailStatus=await requestSetupEmail(admin,email);
    return NextResponse.json({
      id,emailStatus,
      message:emailStatus==="requested"
        ?"Co-Admin account created. Password-setup email requested; confirm delivery."
        :"Co-Admin account created. Configure your email provider and app URL, then resend setup.",
    },{status:201});
  }catch(error){return handleApiError(error);}
}
