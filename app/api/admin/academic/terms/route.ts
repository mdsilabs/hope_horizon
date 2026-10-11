import { NextResponse, type NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/requireSession";
import { createClient } from "@/lib/supabase/server";
import { termCreateSchema } from "@/lib/validations/admin-workflows";
import { AppError, ConflictError, NotFoundError, handleApiError } from "@/lib/utils/errors";

export async function POST(request: NextRequest) {
  try {
    const session = await requireRole(["ADMIN"]);
    const body = termCreateSchema.parse(await request.json());
    const db = await createClient(), schoolId=session.profile.school_id;
    const [parent,school]=await Promise.all([
      db.from("academic_sessions").select("id,start_date,end_date").eq("id",body.academicSessionId)
        .eq("school_id",schoolId).eq("is_active",true).maybeSingle(),
      db.from("schools").select("academic_structure_type,periods_per_session").eq("id",schoolId).single(),
    ]);
    if (parent.error) throw parent.error;
    if (school.error) throw school.error;
    if (!parent.data) throw new NotFoundError("Academic session is not active or belongs to another school.");
    if (body.order > (school.data?.periods_per_session ?? 3))
      throw new AppError("Period order exceeds the school's configured periods per session.",422);
    if (body.startDate < parent.data.start_date || body.endDate > parent.data.end_date)
      throw new AppError("Term dates must fall within the academic session.",422);
    const {data,error}=await db.from("terms").insert({
      school_id:schoolId, academic_session_id:body.academicSessionId,
      structure_type:school.data!.academic_structure_type,
      name:body.name, order:body.order,
      start_date:body.startDate,end_date:body.endDate,is_current:false,
    }).select("id,name,order,academic_session_id,is_current").single();
    if (error?.code==="23505") throw new ConflictError("This period order is already registered for the session.");
    if (error) throw error;
    return NextResponse.json({term:data},{status:201});
  } catch (e) { return handleApiError(e); }
}
