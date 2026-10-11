import { NextResponse, type NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/requireSession";
import { createClient } from "@/lib/supabase/server";
import { classSubjectActionSchema } from "@/lib/validations/admin";
import { uuidString } from "@/lib/validations/common";
import { handleApiError, NotFoundError, ConflictError } from "@/lib/utils/errors";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireRole(["ADMIN"]);
    const { id } = await params;
    const classId = uuidString.parse(id);
    const input = classSubjectActionSchema.parse(await request.json());
    const supabase = await createClient();
    const schoolId = session.profile.school_id;

    // Validate both sides against the authenticated school before altering the join.
    const [{ data: cls }, { data: subject }] = await Promise.all([
      supabase.from("classes").select("id").eq("id", classId)
        .eq("school_id", schoolId).eq("is_active", true).maybeSingle(),
      supabase.from("subjects").select("id").eq("id", input.subjectId)
        .eq("school_id", schoolId).eq("is_active", true).maybeSingle(),
    ]);
    if (!cls || !subject) throw new NotFoundError("Class or subject was not found in this school.");

    if (input.action === "ATTACH") {
      const { error } = await supabase.from("class_subjects").insert({
        class_id: classId, subject_id: input.subjectId,
      });
      if (error?.code === "23505") throw new ConflictError("The subject is already assigned.");
      if (error) throw error;
    } else {
      const { error } = await supabase.from("class_subjects").delete()
        .eq("class_id", classId).eq("subject_id", input.subjectId);
      if (error) throw error;
    }
    return NextResponse.json({ success: true });
  } catch (error) { return handleApiError(error); }
}
