import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/requireSession";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { uuidString } from "@/lib/validations/common";
import { requestSetupEmail } from "@/lib/admin/account-onboarding";
import { AppError, NotFoundError, handleApiError } from "@/lib/utils/errors";

export async function POST(_request: Request,{params}:{params:Promise<{id:string}>}){
  try {
    const session=await requireRole(["ADMIN"]);
    const id=uuidString.parse((await params).id);
    const db=await createClient();
    const {data,error}=await db.from("students").select("id,user_id,is_active")
      .eq("id",id).eq("school_id",session.profile.school_id).maybeSingle();
    if(error)throw error;
    if(!data || !data.is_active || !data.user_id)throw new NotFoundError("Active student account not found.");
    const {data:profile,error:userError}=await db.from("users").select("email,role,is_active")
      .eq("id",data.user_id).eq("school_id",session.profile.school_id).maybeSingle();
    if(userError)throw userError;
    if(!profile || !profile.is_active || profile.role!=="STUDENT")throw new AppError("Student account is not active.",409);
    const status=await requestSetupEmail(createAdminClient(),profile.email);
    if(status!=="requested")throw new AppError("Email could not be requested. Check application URL and Supabase Auth SMTP.",503);
    return NextResponse.json({message:"Password-setup email requested. Confirm delivery with the student."});
  } catch(e){return handleApiError(e);}
}
