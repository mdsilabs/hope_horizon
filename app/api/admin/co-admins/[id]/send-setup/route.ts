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
    if(status==="invalid_redirect")throw new AppError(
      "Co-Admin exists, but email setup cannot start: set NEXT_PUBLIC_APP_URL to https://hopehorizonacademy.vercel.app in Vercel Production, redeploy, and allowlist /reset-password in Supabase Auth.",
      503,"EMAIL_REDIRECT_CONFIGURATION"
    );
    if(status==="auth_rejected")throw new AppError(
      "Co-Admin exists, but Supabase Auth rejected the setup email. Check Supabase Authentication logs, SMTP provider, email sending limits and the verified recipient address. Alternatively, a Primary Administrator can issue a temporary password.",
      503,"AUTH_EMAIL_DELIVERY"
    );
    return NextResponse.json({message:"Password-setup email requested; confirm receipt with the Co-Admin."});
  }catch(error){return handleApiError(error);}
}
