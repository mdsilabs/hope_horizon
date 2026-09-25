import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { forgotPasswordSchema } from "@/lib/validations/auth";
import { recordAuditEntry } from "@/services/auditService";
import { handleApiError } from "@/lib/utils/errors";

/**
 * Delegates to Supabase Auth's built-in password recovery email, which
 * already only sends mail to addresses with an existing account — so,
 * unlike the previous custom implementation, we don't need our own
 * token table (see supabase/migrations/0001_init.sql's note on
 * password_reset_tokens). The response is intentionally identical
 * whether or not the address exists, matching Supabase's own behavior,
 * so this endpoint can't be used to enumerate registered accounts.
 */
export async function POST(request: NextRequest) {
  try {
    const { email } = forgotPasswordSchema.parse(await request.json());
    const supabase = await createClient();

    const { data } = await supabase
      .from("users")
      .select("id, school_id")
      .eq("email", email)
      .eq("is_active", true)
      .maybeSingle();

    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/reset-password`,
    });

    if (data) {
      await recordAuditEntry({
        schoolId: data.school_id,
        userId: data.id,
        action: "PASSWORD_RESET_REQUESTED",
        entityType: "User",
        entityId: data.id,
        request,
      });
    }

    return NextResponse.json({
      message: "If an account exists for that address, a password reset link is on its way.",
    });
  } catch (error) {
    return handleApiError(error);
  }
}
