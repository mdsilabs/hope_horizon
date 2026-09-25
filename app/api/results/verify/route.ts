import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { handleApiError } from "@/lib/utils/errors";

/**
 * Public, unauthenticated endpoint (the QR code destination) — uses the
 * admin client deliberately, since an anonymous visitor has no Supabase
 * session and RLS would otherwise block every row. Only a narrow,
 * intentionally non-sensitive set of fields is returned, and only for
 * results whose status is PUBLISHED.
 */
export async function GET(request: NextRequest) {
  try {
    const code = request.nextUrl.searchParams.get("code");
    if (!code) {
      return NextResponse.json({ valid: false }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data: result } = await supabase
      .from("results")
      .select(
        "overall_average, students(full_name), classes(name), academic_sessions(name), terms(name), schools(name)"
      )
      .eq("qr_verification_code", code)
      .eq("status", "PUBLISHED")
      .maybeSingle();

    if (!result) {
      return NextResponse.json({ valid: false });
    }

    const r = result as unknown as {
      overall_average: number | null;
      students: { full_name: string } | null;
      classes: { name: string } | null;
      academic_sessions: { name: string } | null;
      terms: { name: string } | null;
      schools: { name: string } | null;
    };

    return NextResponse.json({
      valid: true,
      studentName: r.students?.full_name,
      className: r.classes?.name,
      sessionName: r.academic_sessions?.name,
      termName: r.terms?.name,
      overallAverage: r.overall_average,
      schoolName: r.schools?.name,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
