import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth/requireSession";
import { handleApiError, NotFoundError } from "@/lib/utils/errors";

/**
 * Fetches one result with its subject scores. Access control is enforced
 * entirely by Row Level Security (supabase/migrations/0002_rls_policies.sql) —
 * a student, parent, teacher, or approver querying a result they aren't
 * allowed to see simply gets no row back, which we surface as 404 rather
 * than leaking whether the ID exists at all.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireSession();
    const { id } = await params;
    const supabase = await createClient();

    const { data: result, error } = await supabase
      .from("results")
      .select("*, result_subject_scores(*, subjects(name, code))")
      .eq("id", id)
      .single();

    if (error || !result) {
      throw new NotFoundError("Result not found.");
    }

    return NextResponse.json({ result });
  } catch (error) {
    return handleApiError(error);
  }
}
