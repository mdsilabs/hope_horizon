import { NextResponse, type NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/requireSession";
import { createClient } from "@/lib/supabase/server";
import { teacherAssignmentsSchema } from "@/lib/validations/admin-workflows";
import { uuidString } from "@/lib/validations/common";
import { NotFoundError, AppError, handleApiError } from "@/lib/utils/errors";

export async function PUT(request: NextRequest, { params }: { params: Promise<{id:string}> }) {
  try {
    const session = await requireRole(["ADMIN"]);
    const id = uuidString.parse((await params).id);
    const body = teacherAssignmentsSchema.parse(await request.json());
    const db = await createClient();
    const { data: teacher, error: findError } = await db.from("teachers").select("id")
      .eq("id", id).eq("school_id", session.profile.school_id).eq("is_active", true).maybeSingle();
    if (findError) throw findError;
    if (!teacher) throw new NotFoundError("Teacher is not active or does not belong to this school.");
    const { error } = await db.rpc("hh_admin_replace_teacher_assignments", {
      p_teacher_id: id,
      p_class_ids: body.assignedClassIds,
      p_subject_assignments: body.subjectAssignments,
    });
    if (error) {
      if (error.code === "PGRST202") throw new AppError("Apply migration 0005 to enable assignments.", 503, "MIGRATION_REQUIRED");
      if (["22023","23503","42501"].includes(error.code)) throw new AppError("Invalid assignment: confirm the classes and subjects are active and belong to this school.", 422);
      throw error;
    }
    const { error: auditError } = await db.from("audit_logs").insert({
      school_id: session.profile.school_id, user_id: session.authUserId,
      action: "TEACHER_UPDATED", entity_type: "teacher", entity_id: id,
      metadata: { class_count: body.assignedClassIds.length, subject_count: body.subjectAssignments.length },
    });
    if (auditError) console.error("Teacher assignment audit failed", auditError);
    return NextResponse.json({ success: true });
  } catch (e) { return handleApiError(e); }
}
