import { NextResponse, type NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/requireSession";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { coAdminCreateSchema } from "@/lib/validations/co-admin";
import { generateUnusedPassword, generateTemporaryPassword, requestSetupEmail, requireProvisioningSecurity } from "@/lib/admin/account-onboarding";
import { AppError, handleApiError } from "@/lib/utils/errors";
import { diagnoseCoAdminCreateFailure } from "@/lib/admin/co-admin-errors";

export async function GET(){
  try{
    const session=await requireRole(["ADMIN"]);
    const db=await createClient();
    const {data,error}=await db.from("users")
      .select("id,name,email,admin_tier,is_active,last_login_at,created_at")
      .eq("school_id",session.profile.school_id).eq("role","ADMIN")
      .order("created_at",{ascending:true}).limit(200);
    if (error) {
      // Missing migration 0008 results in a missing admin_tier column.
      if (error.code === "42703" || error.code === "PGRST204")
        throw new AppError("Install migration 0008 to enable Co-Admin management.",503,"MIGRATION_REQUIRED");
      throw error;
    }
    if(data?.some(user=>!user.admin_tier))
      throw new AppError("Run migration 0008 to enable Co-Admin management.",503,"MIGRATION_REQUIRED");

    // Read-only readiness check. Show the actual blocker BEFORE an admin
    // tries to create a privileged account, and don't reveal credentials.
    let blockedReason: string | null=null;
    const {data:guard,error:guardError}=await db.rpc("hh_onboarding_guard_ready");
    if(guardError || guard!==true)
      blockedReason="Install migration 0012 (password onboarding guard).";
    const {data:capabilities,error:capabilitiesError}=await db.rpc("hh_portal_capabilities");
    if(!blockedReason && (capabilitiesError || !capabilities?.auth_trigger || !capabilities?.authorization_guard))
      blockedReason="Install the authentication/security migrations 0004 and 0005.";
    if(!blockedReason && !(data??[]).some(user=>user.admin_tier==="PRIMARY" && user.is_active))
      blockedReason="No active protected Primary Administrator exists. Review migration 0008.";
    if(!blockedReason && !process.env.SUPABASE_SECRET_KEY && !process.env.SUPABASE_SERVICE_ROLE_KEY)
      blockedReason="Set a server-only Supabase secret/service-role key in Vercel Production and redeploy.";
    if(!blockedReason){
      try{
        const admin=createAdminClient();
        const {error:adminError}=await admin.auth.admin.listUsers({page:1,perPage:1});
        if(adminError)blockedReason="Supabase Auth Admin API rejected the server key. Check the Supabase project and Vercel credential.";
      }catch{
        blockedReason="Supabase Auth administration could not be reached. Review the server key and provider connection.";
      }
    }

    return NextResponse.json({
      administrators:data??[],currentUserId:session.authUserId,
      creationReadiness:{ready:!blockedReason,message:blockedReason},
    },{headers:{"Cache-Control":"no-store, private"}});
  }catch(error){return handleApiError(error);}
}

export async function POST(request:NextRequest){
  try{
    const session=await requireRole(["ADMIN"]);
    const {fullName,email,setupMethod}=coAdminCreateSchema.parse(await request.json());
    const db=await createClient(),schoolId=session.profile.school_id;
    await requireProvisioningSecurity();
    const {data:guardReady,error:guardError}=await db.rpc("hh_onboarding_guard_ready");
    if(guardError || guardReady!==true)
      throw new AppError("Install SQL migration 0012 before creating a Co-Admin.",503,"MIGRATION_REQUIRED");
    // Fail closed if migration 0008 (tier + deletion guard) is absent.
    const {data:owner,error:ownerError}=await db.from("users")
      .select("id,admin_tier").eq("school_id",schoolId).eq("role","ADMIN")
      .eq("admin_tier","PRIMARY").eq("is_active",true).limit(1);
    if(ownerError || !owner?.length)
      throw new AppError("A protected primary admin is required. Apply migration 0008.",503,"MIGRATION_REQUIRED");

    const admin=createAdminClient();
    const temporaryPassword=setupMethod==="TEMPORARY_PASSWORD" ? generateTemporaryPassword() : null;
    const {data:created,error:createError}=await admin.auth.admin.createUser({
      email,password:temporaryPassword ?? generateUnusedPassword(),email_confirm:true,
      user_metadata:{name:fullName},
      app_metadata:{
        school_id:schoolId,role:"ADMIN",admin_tier:"CO_ADMIN",must_change_password:true,
        setup_method:setupMethod,
      },
    });
    if(createError || !created.user) {
      const diagnosis=diagnoseCoAdminCreateFailure(createError);
      // Log only code and status for diagnosis, never credentials or Auth tokens.
      console.error("Co-Admin Auth creation failed", {
        code: createError?.code || "unknown",
        status: createError?.status || 0,
      });
      throw new AppError(diagnosis.message,diagnosis.status,diagnosis.code);
    }

    const id=created.user.id;
    try{
      // Read the freshly provisioned user with the already authorized
      // server-side client; a new Co-Admin cannot pass onboarding RLS yet.
      const {data:profile,error:profileError}=await admin.from("users")
        .select("id,school_id,role,admin_tier,is_active,must_change_password")
        .eq("id",id).eq("school_id",schoolId).maybeSingle();
      if(profileError || !profile || profile.role!=="ADMIN" ||
         profile.admin_tier!=="CO_ADMIN" || !profile.is_active || !profile.must_change_password)
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
    const emailStatus=setupMethod==="EMAIL_LINK" ? await requestSetupEmail(admin,email) : "not_requested";
    return NextResponse.json({
      id,email,setupMethod,emailStatus,
      ...(temporaryPassword?{temporaryPassword}:{}),
      message:temporaryPassword
        ?"Co-Admin created without email. Copy the temporary password now; it cannot be retrieved later."
        :emailStatus==="requested"
          ?"Co-Admin created. Password-setup email requested; confirm delivery."
          :"Co-Admin created, but no setup email was sent. Configure Supabase Auth SMTP and resend the link.",
    },{status:201,headers:{"Cache-Control":"no-store, private"}});
  }catch(error){return handleApiError(error);}
}
