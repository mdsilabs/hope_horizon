import { NextResponse, type NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/requireSession";
import { createClient } from "@/lib/supabase/server";
import { schoolSettingsSchema } from "@/lib/validations/school-settings";
import { AppError, NotFoundError, handleApiError } from "@/lib/utils/errors";

const fields = [
  "id", "name", "contact_email", "contact_phone", "address", "website", "levels",
  "academic_structure_type", "academic_period_label", "periods_per_session",
  "ca_max_score", "exam_max_score",
].join(",");

export async function GET() {
  try {
    const session = await requireRole(["ADMIN"]);
    const db = await createClient();
    const { data, error } = await db.from("schools").select(fields)
      .eq("id", session.profile.school_id).single();
    if (error) throw error;
    if (!data) throw new NotFoundError("School not found.");
    return NextResponse.json({ school: data });
  } catch (error) { return handleApiError(error); }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await requireRole(["ADMIN"]);
    const input = schoolSettingsSchema.parse(await request.json());
    const db = await createClient();
    const schoolId = session.profile.school_id;
    const { data: current, error: readError } = await db.from("schools")
      .select("id,academic_structure_type,academic_period_label,periods_per_session,ca_max_score,exam_max_score")
      .eq("id", schoolId).single();
    if (readError) throw readError;
    if (!current) throw new NotFoundError("School not found.");

    const changingAcademicStructure =
      input.academicStructureType !== current.academic_structure_type ||
      input.academicPeriodLabel !== current.academic_period_label ||
      input.periodsPerSession !== current.periods_per_session;
    const changingGradeTotals =
      input.caMaxScore !== current.ca_max_score || input.examMaxScore !== current.exam_max_score;

    // Keep earlier school periods and issued results consistent.
    if (changingAcademicStructure) {
      const { count, error } = await db.from("terms").select("id", { count:"exact", head:true })
        .eq("school_id",schoolId);
      if (error) throw error;
      if ((count ?? 0) > 0) throw new AppError(
        "Academic structure is locked after periods have been created. You can still edit school contact details.",
        409, "ACADEMIC_STRUCTURE_LOCKED"
      );
    }
    if (changingGradeTotals) {
      const { count, error } = await db.from("results").select("id", { count:"exact", head:true })
        .eq("school_id",schoolId);
      if (error) throw error;
      if ((count ?? 0) > 0) throw new AppError(
        "CA and exam maximum scores are locked once results exist.",
        409, "GRADING_STRUCTURE_LOCKED"
      );
    }
    const changes = {
      name: input.name,
      contact_email: input.contactEmail || null,
      contact_phone: input.contactPhone || null,
      address: input.address || null,
      website: input.website || null,
      levels: input.levels,
      academic_structure_type: input.academicStructureType,
      academic_period_label: input.academicPeriodLabel,
      periods_per_session: input.periodsPerSession,
      ca_max_score: input.caMaxScore,
      exam_max_score: input.examMaxScore,
    };
    const { data, error } = await db.from("schools").update(changes).eq("id",schoolId)
      .select(fields).single();
    if (error) throw error;
    if (!data) throw new NotFoundError("Unable to update school.");

    const { error: auditError } = await db.from("audit_logs").insert({
      school_id:schoolId, user_id:session.authUserId, action:"SYSTEM_SETTING_CHANGED",
      entity_type:"school", entity_id:schoolId,
      metadata:{ fields:Object.keys(changes) },
    });
    if (auditError) console.error("School settings audit failed", auditError);
    return NextResponse.json({ school:data });
  } catch (error) { return handleApiError(error); }
}
