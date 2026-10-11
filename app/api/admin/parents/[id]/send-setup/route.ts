import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/requireSession";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { uuidString } from "@/lib/validations/common";
import { requestSetupEmail } from "@/lib/admin/account-onboarding";
import { NotFoundError, AppError, handleApiError } from "@/lib/utils/errors";

export async function POST(_request:Request,{params}:{params:Promise<{id:string}>}){
  try {
    const session=await requireRole(["ADMIN"]);
    const id=uuidString.parse((await params).id);
    const db=await createClient();
    const {data:parent,error}=await db.from("parents").select("id,email,user_id,is_active")
      .eq("id",id).eq("school_id",session.profile.school_id).maybeSingle();
    if(error)throw error;
    if(!parent||!parent.is_active)throw new NotFoundError("Active parent not found.");
    const {data:profile,error:profileError}=await db.from("users").select("role,email,is_active")
      .eq("id",parent.user_id).eq("school_id",session.profile.school_id).maybeSingle();
    if(profileError)throw profileError;
    if(!profile || !profile.is_active || profile.role!=="PARENT")throw new AppError("Parent login is inactive.",409);
    const emailStatus=await requestSetupEmail(createAdminClient(),profile.email);
    if(emailStatus!=="requested")throw new AppError("Email request could not be made. Check Supabase Auth SMTP and the app URL.",503);
    return NextResponse.json({message:"Setup email requested. Confirm receipt with the parent."});
  }catch(e){return handleApiError(e);}
}
