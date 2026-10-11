import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loginSchema } from "@/lib/validations/auth";
import { ROLE_HOME_ROUTE } from "@/lib/auth/rbac";
import { handleApiError, AuthenticationError } from "@/lib/utils/errors";


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

    // Do not require a high-privilege service key merely to sign in.
    // This audit write uses the newly authenticated user's RLS-scoped session.
    const { error: auditError } = await supabase.from("audit_logs").insert({
      school_id: profile.school_id,
      user_id: profile.id,
      action: "LOGIN",
      entity_type: "User",
      entity_id: profile.id,
      ip_address: request.headers.get("x-forwarded-for"),
      user_agent: request.headers.get("user-agent"),
    });
    if (auditError) console.error("Login audit logging failed:", auditError);

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
