import { NextResponse, type NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/requireSession";
import { createClient } from "@/lib/supabase/server";
import { adminSubjectCreateSchema } from "@/lib/validations/admin";
import { ConflictError, handleApiError } from "@/lib/utils/errors";

export async function GET() {
  try {
    const session = await requireRole(["ADMIN"]);
    const supabase = await createClient();
    const { data, error } = await supabase.from("subjects")
      .select("id, name, code, description, is_active")
      .eq("school_id", session.profile.school_id)
      .order("name");
    if (error) throw error;
    return NextResponse.json({ subjects: data ?? [] });
  } catch (error) { return handleApiError(error); }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireRole(["ADMIN"]);
    const input = adminSubjectCreateSchema.parse(await request.json());
    const supabase = await createClient();
    const { data, error } = await supabase.from("subjects").insert({
      school_id: session.profile.school_id,
      name: input.name,
      code: input.code,
      description: input.description || null,
      ca_max_score_override: input.caMaxScoreOverride ?? null,
      exam_max_score_override: input.examMaxScoreOverride ?? null,
    }).select("id, name, code, description, is_active").single();
    if (error?.code === "23505") throw new ConflictError("This subject code already exists.");
    if (error) throw error;
    return NextResponse.json({ subject: data }, { status: 201 });
  } catch (error) { return handleApiError(error); }
}
