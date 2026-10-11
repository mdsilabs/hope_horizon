import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/requireSession";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { uuidString } from "@/lib/validations/common";
import { requestSetupEmail } from "@/lib/admin/account-onboarding";
import { AppError,NotFoundError,handleApiError } from "@/lib/utils/errors";

export async function POST(_request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const session=await requireRole(["ADMIN"]);
    const id=uuidString.parse((await params).id);
    const db=await createClient();
    const {data:user,error}=await db.from("users")
      .select("id,email,is_active,admin_tier").eq("id",id)
      .eq("school_id",session.profile.school_id).eq("role","ADMIN").maybeSingle();
    if(error)throw error;
    if(!user || user.admin_tier!=="CO_ADMIN")throw new NotFoundError("Co-Admin not found.");
    if(!user.is_active)throw new AppError("Reactivate this Co-Admin before sending setup email.",409);
    const status=await requestSetupEmail(createAdminClient(),user.email);
    if(status!=="requested")throw new AppError("Could not request password-setup email. Check NEXT_PUBLIC_APP_URL and Auth SMTP.",503);
    return NextResponse.json({message:"Password-setup email requested; confirm receipt with the Co-Admin."});
  }catch(error){return handleApiError(error);}
}
