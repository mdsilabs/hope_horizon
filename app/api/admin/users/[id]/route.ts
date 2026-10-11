import { NextResponse,type NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/requireSession";
import { createClient } from "@/lib/supabase/server";
import { adminUserPatchSchema } from "@/lib/validations/profile-media";
import { uuidString } from "@/lib/validations/common";
import { NotFoundError,handleApiError } from "@/lib/utils/errors";

export async function PATCH(request:NextRequest,{params}:{params:Promise<{id:string}>}){
  try{
    const session=await requireRole(["ADMIN"]);
    const targetId=uuidString.parse((await params).id);
    const changes=adminUserPatchSchema.parse(await request.json());
    const db=await createClient();
    const {data:target,error:targetError}=await db.from("users")
      .select("id,role").eq("id",targetId).eq("school_id",session.profile.school_id).maybeSingle();
    if(targetError)throw targetError;
    if(!target)throw new NotFoundError("User not found in your school.");
    const {data,error}=await db.from("users").update({
      name:changes.name,phone:changes.phone||null,whatsapp_number:changes.whatsappNumber||null,
    }).eq("id",targetId).eq("school_id",session.profile.school_id)
      .select("id,name,email,role,phone,whatsapp_number,avatar_url,is_active").single();
    if(error)throw error;
    const {error:auditError}=await db.from("audit_logs").insert({
      school_id:session.profile.school_id,user_id:session.authUserId,
      action:"SYSTEM_SETTING_CHANGED",entity_type:"profile",entity_id:targetId,
      metadata:{fields:["name","phone","whatsapp_number"]},
    });
    if(auditError)console.error("Admin user-profile audit failed.");
    return NextResponse.json({user:data});
  }catch(e){return handleApiError(e);}
}
