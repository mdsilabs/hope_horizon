import { NextResponse, type NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/requireSession";
import { createClient } from "@/lib/supabase/server";
import { uuidString } from "@/lib/validations/common";
import { parentChildrenSchema } from "@/lib/validations/family-accounts";
import { NotFoundError, AppError, handleApiError } from "@/lib/utils/errors";

export async function PUT(request:NextRequest,{params}:{params:Promise<{id:string}>}){
  try {
    const session=await requireRole(["ADMIN"]);
    const id=uuidString.parse((await params).id);
    const input=parentChildrenSchema.parse(await request.json());
    const db=await createClient();
    const {data:parent,error:parentError}=await db.from("parents").select("id,is_active")
      .eq("id",id).eq("school_id",session.profile.school_id).maybeSingle();
    if(parentError)throw parentError;
    if(!parent || !parent.is_active)throw new NotFoundError("Active parent account not found.");
    const {data,error}=await db.rpc("hh_admin_replace_parent_children",{
      p_parent_id:id,p_student_ids:input.studentIds,
    });
    if(error || data!==true)throw new AppError("Unable to save linked children. Make sure all students belong to your school and migration 0006 is installed.",422);
    const {error:auditError}=await db.from("audit_logs").insert({
      school_id:session.profile.school_id,user_id:session.authUserId,action:"SYSTEM_SETTING_CHANGED",
      entity_type:"parent",entity_id:id,metadata:{operation:"child_links_updated",child_count:input.studentIds.length},
    });
    if(auditError)console.error("Parent-link audit failed.");
    return NextResponse.json({message:"Children linked successfully."});
  }catch(e){return handleApiError(e);}
}
