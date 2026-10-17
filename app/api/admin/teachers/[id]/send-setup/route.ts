import { NextResponse, type NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/requireSession";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { uuidString } from "@/lib/validations/common";
import { AppError, NotFoundError, handleApiError } from "@/lib/utils/errors";
import { getApprovedRecoveryUrl } from "@/lib/admin/account-onboarding";

export async function POST(_request: NextRequest, { params }: {params:Promise<{id:string}>}) {
  try {
    const session = await requireRole(["ADMIN"]);
    const id = uuidString.parse((await params).id);
    const db = await createClient();
    const {data:teacher, error} = await db.from("teachers")
      .select("id, users(email)").eq("id",id).eq("school_id", session.profile.school_id)
      .eq("is_active",true).maybeSingle();
    if (error) throw error;
    if (!teacher) throw new NotFoundError("Teacher not found.");
    const redirectTo = getApprovedRecoveryUrl();
    if (!redirectTo) throw new AppError("Configure NEXT_PUBLIC_APP_URL with your deployed HTTPS origin before sending setup emails.",503);
    const email = (teacher.users as {email: string}|null)?.email;
    if (!email) throw new AppError("No teacher email is linked to this account.",422);
    const admin = createAdminClient();
    const result = await admin.auth.resetPasswordForEmail(email, {redirectTo});
    if (result.error) throw new AppError("Email could not be requested. Check Supabase email delivery and allowed redirect URLs.",502);
    return NextResponse.json({message:"Setup email requested. Confirm receipt with the teacher."});
  } catch (e) {return handleApiError(e);}
}
