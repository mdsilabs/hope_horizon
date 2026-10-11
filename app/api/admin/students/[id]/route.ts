import { NextResponse, type NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/requireSession";
import { createClient } from "@/lib/supabase/server";
import { adminStudentPatchSchema } from "@/lib/validations/admin";
import { uuidString } from "@/lib/validations/common";
import { ConflictError, NotFoundError, handleApiError } from "@/lib/utils/errors";
import type { Database } from "@/types/database";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRole(["ADMIN"]);
    const { id } = await params;
    const studentId = uuidString.parse(id);
    const input = adminStudentPatchSchema.parse(await request.json());
    const supabase = await createClient();
    const schoolId = session.profile.school_id;

    const { data: existing, error: findError } = await supabase.from("students")
      .select("id").eq("id", studentId).eq("school_id", schoolId).maybeSingle();
    if (findError) throw findError;
    if (!existing) throw new NotFoundError("Student not found.");

    if (input.classId !== undefined) {
      const { data: cls, error: classError } = await supabase.from("classes")
        .select("id").eq("id", input.classId).eq("school_id", schoolId)
        .eq("is_active", true).maybeSingle();
      if (classError) throw classError;
      if (!cls) throw new NotFoundError("Choose an active class in your school.");
    }

    const update: Database["public"]["Tables"]["students"]["Update"] = {};
    if (input.fullName !== undefined) update.full_name = input.fullName;
    if (input.admissionNumber !== undefined) update.admission_number = input.admissionNumber;
    if (input.registrationNumber !== undefined) update.registration_number = input.registrationNumber || null;
    if (input.studentId !== undefined) update.student_id = input.studentId || null;
    if (input.classId !== undefined) update.class_id = input.classId;
    if (input.gender !== undefined) update.gender = input.gender;
    if (input.dateOfBirth !== undefined) update.date_of_birth = input.dateOfBirth.toISOString().slice(0, 10);
    if (input.passportUrl !== undefined) update.passport_url = input.passportUrl || null;
    if (input.isActive !== undefined) update.is_active = input.isActive;

    const { data, error } = await supabase.from("students").update(update)
      .eq("id", studentId).eq("school_id", schoolId)
      .select("id, full_name, admission_number, class_id, is_active").single();
    if (error?.code === "23505") throw new ConflictError("Admission or registration number is already in use.");
    if (error) throw error;
    const { error: auditError } = await supabase.from("audit_logs").insert({
      school_id: schoolId, user_id: session.authUserId,
      action: "STUDENT_UPDATED", entity_type: "student", entity_id: studentId,
      metadata: { changed_fields: Object.keys(update) },
    });
    if (auditError) console.error("Student audit logging failed:", auditError);
    return NextResponse.json({ student: data });
  } catch (error) { return handleApiError(error); }
}
