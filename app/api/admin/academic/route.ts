import { NextResponse, type NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/requireSession";
import { createClient } from "@/lib/supabase/server";
import { academicCreateSchema } from "@/lib/validations/admin-workflows";
import { ConflictError, handleApiError } from "@/lib/utils/errors";

export async function GET() {
  try {
    const session = await requireRole(["ADMIN"]);
    const db = await createClient();
    const schoolId = session.profile.school_id;
    const [school, sessions, terms] = await Promise.all([
      db.from("schools").select("id, academic_period_label, periods_per_session, current_academic_session_id, current_term_id").eq("id",schoolId).single(),
      db.from("academic_sessions").select("id, name, start_date, end_date, is_current, is_active")
        .eq("school_id",schoolId).order("start_date",{ascending:false}).limit(100),
      db.from("terms").select("id, academic_session_id, name, order, start_date, end_date, is_current, is_active")
        .eq("school_id",schoolId).order("start_date",{ascending:false}).limit(300),
    ]);
    if (school.error) throw school.error;
    if (sessions.error) throw sessions.error;
    if (terms.error) throw terms.error;
    return NextResponse.json({ school:school.data, sessions:sessions.data ?? [], terms:terms.data ?? [] });
  } catch (e) { return handleApiError(e); }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireRole(["ADMIN"]);
    const body = academicCreateSchema.parse(await request.json());
    const db = await createClient();
    const {data,error} = await db.from("academic_sessions").insert({
      school_id:session.profile.school_id, name:body.name,
      start_date:body.startDate, end_date:body.endDate, is_current:false,
    }).select("id,name,start_date,end_date,is_current,is_active").single();
    if (error?.code === "23505") throw new ConflictError("This academic session already exists.");
    if (error) throw error;
    return NextResponse.json({session:data},{status:201});
  } catch (e) { return handleApiError(e); }
}
