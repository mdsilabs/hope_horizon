import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loginSchema } from "@/lib/validations/auth";
import { ROLE_HOME_ROUTE } from "@/lib/auth/rbac";
import { handleApiError, AuthenticationError } from "@/lib/utils/errors";
import { recordAuditEntry } from "@/services/auditService";

export async function POST(request: NextRequest) {
  try {
    const body = loginSchema.parse(await request.json());
    const supabase = await createClient();

    const { data, error } = await supabase.auth.signInWithPassword({
      email: body.email,
      password: body.password,
    });

    if (error || !data.user) {
      throw new AuthenticationError("Incorrect email or password.");
    }

    const { data: profile } = await supabase
      .from("users")
      .select("*")
      .eq("id", data.user.id)
      .single();

    if (!profile || !profile.is_active) {
      await supabase.auth.signOut();
      throw new AuthenticationError("This account is inactive. Contact your school administrator.");
    }

    await supabase.from("users").update({ last_login_at: new Date().toISOString() }).eq("id", profile.id);

    await recordAuditEntry({
      schoolId: profile.school_id,
      userId: profile.id,
      action: "LOGIN",
      entityType: "User",
      entityId: profile.id,
      request,
    });

    // The Supabase server client's cookie adapter already wrote the
    // session cookies onto this request's cookie jar during
    // signInWithPassword — no manual cookie handling needed here.
    return NextResponse.json({
      homeRoute: ROLE_HOME_ROUTE[profile.role],
      user: { name: profile.name, role: profile.role, email: profile.email },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
