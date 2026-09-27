import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth/requireSession";
import { resultSchema } from "@/lib/validations/result";
import { saveDraftResult } from "@/services/resultService";
import { handleApiError, AuthorizationError } from "@/lib/utils/errors";
import { RESULT_STATUSES, type ResultStatus } from "@/types/enums";

/**
 * Lists results visible to the current user. Row Level Security already
 * restricts what each role can see (supabase/migrations/0002_rls_policies.sql),
 * so this query is intentionally simple — the same `select` works for
 * every role, and Postgres filters the rows.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await requireSession();
    const supabase = await createClient();

    const statusParam = request.nextUrl.searchParams.get("status");
    const classId = request.nextUrl.searchParams.get("classId");

    if (statusParam && !RESULT_STATUSES.includes(statusParam as ResultStatus)) {
      return NextResponse.json({ error: "Invalid result status filter." }, { status: 400 });
    }
    const status = statusParam as ResultStatus | null;

    let query = supabase
      .from("results")
      .select("*, result_subject_scores(*)")
      .order("updated_at", { ascending: false })
      .limit(200);

    if (status) query = query.eq("status", status);
    if (classId) query = query.eq("class_id", classId);

    // Teachers only ever see results they entered — RLS enforces this too,
    // but filtering explicitly keeps the query plan efficient.
    if (session.profile.role === "TEACHER") {
      query = query.eq("entered_by", session.authUserId);
    }

    const { data: results, error } = await query;
    if (error) throw new AuthorizationError(error.message);

    return NextResponse.json({ results: results ?? [] });
  } catch (error) {
    return handleApiError(error);
  }
}

/** Creates or updates a draft result. Teachers only, scoped to their assignments. */
export async function POST(request: NextRequest) {
  try {
    const session = await requireSession();
    const body = resultSchema.parse(await request.json());
    const result = await saveDraftResult(session, body);
    return NextResponse.json({ result }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
