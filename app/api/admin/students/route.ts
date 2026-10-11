import { NextResponse, type NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/requireSession";
import { createClient } from "@/lib/supabase/server";
import { adminStudentCreateSchema } from "@/lib/validations/admin";
import { uuidString } from "@/lib/validations/common";
import { ConflictError, NotFoundError, handleApiError } from "@/lib/utils/errors";

export async function GET(request: NextRequest) {
  try {
    const session = await requireRole(["ADMIN"]);
    const supabase = await createClient();
    const page = Number(request.nextUrl.searchParams.get("page") || "1");
    const query = (request.nextUrl.searchParams.get("q") || "").trim();
    const classId = request.nextUrl.searchParams.get("classId") || "";
    if (!Number.isSafeInteger(page) || page < 1 || page > 100000 || query.length > 80) {
      return NextResponse.json({ error: { message: "Invalid search or page." } }, { status: 400 });
    }
    if (classId) uuidString.parse(classId);
    const pageSize = 25;
    let dbQuery = supabase.from("students")
      .select("id, full_name, admission_number, registration_number, student_id, class_id, gender, date_of_birth, passport_url, is_active, user_id, users(email)", { count: "exact" })
      .eq("school_id", session.profile.school_id);
    if (classId) dbQuery = dbQuery.eq("class_id", classId);
    if (query) dbQuery = dbQuery.ilike("full_name", "%" + query.replace(/[%_\\]/g, "\\$&") + "%");
    const { data, count, error } = await dbQuery
      .order("full_name", { ascending: true })
      .range((page - 1) * pageSize, page * pageSize - 1);
    if (error) throw error;
    return NextResponse.json({ students: data ?? [], total: count ?? 0, page, pageSize });
  } catch (error) { return handleApiError(error); }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireRole(["ADMIN"]);
    const input = adminStudentCreateSchema.parse(await request.json());
    const supabase = await createClient();
    const schoolId = session.profile.school_id;
    const { data: cls, error: classError } = await supabase.from("classes")
      .select("id").eq("id", input.classId).eq("school_id", schoolId)
      .eq("is_active", true).maybeSingle();
    if (classError) throw classError;
    if (!cls) throw new NotFoundError("Choose an active class in your school.");
    const { data, error } = await supabase.from("students").insert({
      school_id: schoolId,
      full_name: input.fullName,
      admission_number: input.admissionNumber,
      registration_number: input.registrationNumber || null,
      student_id: input.studentId || null,
      class_id: input.classId,
      gender: input.gender || null,
      date_of_birth: input.dateOfBirth ? input.dateOfBirth.toISOString().slice(0, 10) : null,
      passport_url: input.passportUrl || null,
    }).select("id, full_name, admission_number, class_id, is_active").single();
    if (error?.code === "23505") throw new ConflictError("Admission or registration number is already in use.");
    if (error) throw error;
    const { error: auditError } = await supabase.from("audit_logs").insert({
      school_id: schoolId, user_id: session.authUserId,
      action: "STUDENT_CREATED", entity_type: "student", entity_id: data.id,
    });
    if (auditError) console.error("Student audit logging failed:", auditError);
    return NextResponse.json({ student: data }, { status: 201 });
  } catch (error) { return handleApiError(error); }
}
