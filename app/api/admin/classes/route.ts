import { NextResponse, type NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/requireSession";
import { createClient } from "@/lib/supabase/server";
import { adminClassCreateSchema } from "@/lib/validations/admin";
import { ConflictError, handleApiError } from "@/lib/utils/errors";

export async function GET() {
  try {
    const session = await requireRole(["ADMIN"]);
    const supabase = await createClient();
    const { data, error } = await supabase.from("classes")
      .select("id, name, level, arm, order, is_active, class_subjects(subject_id)")
      .eq("school_id", session.profile.school_id)
      .order("order", { ascending: true })
      .order("name", { ascending: true });
    if (error) throw error;
    return NextResponse.json({ classes: data ?? [] });
  } catch (error) { return handleApiError(error); }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireRole(["ADMIN"]);
    const input = adminClassCreateSchema.parse(await request.json());
    const supabase = await createClient();
    const { data, error } = await supabase.from("classes").insert({
      school_id: session.profile.school_id,
      name: input.name,
      level: input.level,
      arm: input.arm || null,
      order: input.order,
    }).select("id, name, level, arm, order, is_active").single();
    if (error?.code === "23505") throw new ConflictError("This class and arm already exist.");
    if (error) throw error;
    return NextResponse.json({ class: data }, { status: 201 });
  } catch (error) { return handleApiError(error); }
}
