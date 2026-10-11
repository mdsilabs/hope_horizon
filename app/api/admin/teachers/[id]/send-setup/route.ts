import { NextResponse, type NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/requireSession";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { uuidString } from "@/lib/validations/common";
import { AppError, NotFoundError, handleApiError } from "@/lib/utils/errors";

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
    const origin=process.env.NEXT_PUBLIC_APP_URL;
    if (!origin) throw new AppError("Configure NEXT_PUBLIC_APP_URL before sending setup emails.",503);
    const parsed = new URL(origin);
    if (parsed.protocol !== "https:" && !(parsed.hostname==="localhost" && parsed.protocol==="http:"))
      throw new AppError("NEXT_PUBLIC_APP_URL must be an HTTPS URL.",503);
    const email = (teacher.users as {email: string}|null)?.email;
    if (!email) throw new AppError("No teacher email is linked to this account.",422);
    const admin = createAdminClient();
    const result = await admin.auth.resetPasswordForEmail(email, {redirectTo:new URL("/reset-password",parsed).toString()});
    if (result.error) throw new AppError("Email could not be requested. Check Supabase email delivery and allowed redirect URLs.",502);
    return NextResponse.json({message:"Setup email requested. Confirm receipt with the teacher."});
  } catch (e) {return handleApiError(e);}
}
