import { NextResponse,type NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/requireSession";
import { createClient } from "@/lib/supabase/server";
import { uuidString } from "@/lib/validations/common";
import { coAdminStatusSchema,mayChangeCoAdmin } from "@/lib/validations/co-admin";
import { AuthorizationError, NotFoundError, handleApiError } from "@/lib/utils/errors";

export async function PATCH(request:NextRequest,{params}:{params:Promise<{id:string}>}){
  try{
    const session=await requireRole(["ADMIN"]);
    const targetId=uuidString.parse((await params).id);
    const {isActive}=coAdminStatusSchema.parse(await request.json());
    const db=await createClient(), schoolId=session.profile.school_id;
    const {data:target,error:targetError}=await db.from("users")
      .select("id,role,admin_tier,is_active").eq("id",targetId)
      .eq("school_id",schoolId).maybeSingle();
    if(targetError)throw targetError;
    if(!target)throw new NotFoundError("Co-Admin not found in this school.");
    if(!mayChangeCoAdmin(session.authUserId,targetId,target.admin_tier as "PRIMARY"|"CO_ADMIN",target.role))
      throw new AuthorizationError("Primary administrators and your own account cannot be deactivated or changed here.");
    const {data,error}=await db.from("users").update({is_active:isActive})
      .eq("id",targetId).eq("school_id",schoolId)
      .eq("role","ADMIN").eq("admin_tier","CO_ADMIN")
      .select("id,is_active,admin_tier").single();
    if(error)throw error;
    if(!data)throw new NotFoundError("Co-Admin not found.");
    const {error:auditError}=await db.from("audit_logs").insert({
      school_id:schoolId,user_id:session.authUserId,action:"SYSTEM_SETTING_CHANGED",
      entity_type:"co_admin",entity_id:targetId,
      metadata:{operation:isActive?"co_admin_reactivated":"co_admin_deactivated"},
    });
    if(auditError)console.error("Co-Admin status audit failed.");
    return NextResponse.json({administrator:data,
      message:isActive?"Co-Admin reactivated.":"Co-Admin deactivated. Their account can no longer access the portal."});
  }catch(error){return handleApiError(error);}
}
