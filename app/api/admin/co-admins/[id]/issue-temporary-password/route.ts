import { NextResponse, type NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/requireSession";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateTemporaryPassword } from "@/lib/admin/account-onboarding";
import { uuidString } from "@/lib/validations/common";
import { AppError, AuthorizationError, NotFoundError, handleApiError } from "@/lib/utils/errors";

/**
 * Recovery for an EXISTING Co-Admin whose email onboarding is blocked.
 * A Primary Admin may issue a single-display credential only while the
 * target's onboarding is incomplete. This does not touch their role,
 * protected primary administrator, or unrelated accounts.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireRole(["ADMIN"]);
    if (session.profile.admin_tier !== "PRIMARY") {
      throw new AuthorizationError("Only the Primary Administrator can issue a temporary Co-Admin password.");
    }

    const origin = request.headers.get("origin");
    if (!origin || origin !== new URL(request.url).origin) {
      throw new AuthorizationError("Open this action from the school administration website.");
    }

    const body: unknown = await request.json();
    if (
      typeof body !== "object" || body === null || Array.isArray(body) ||
      Object.keys(body).length !== 1 ||
      (body as Record<string,unknown>).confirm !== "ISSUE_TEMPORARY_PASSWORD"
    ) {
      throw new AppError("Explicit confirmation is required to replace an unused setup credential.",422);
    }

    const id = uuidString.parse((await params).id);
    if (id === session.authUserId) {
      throw new AuthorizationError("You cannot issue a temporary password to your own administrator account.");
    }

    const admin = createAdminClient();
    const schoolId = session.profile.school_id;
    const { data: profile, error: profileError } = await admin.from("users")
      .select("id,email,school_id,role,admin_tier,is_active,must_change_password")
      .eq("id",id).eq("school_id",schoolId).maybeSingle();
    if (profileError) throw new AppError("Could not verify the Co-Admin account.",503);
    if (!profile || profile.role !== "ADMIN" || profile.admin_tier !== "CO_ADMIN") {
      throw new NotFoundError("Co-Admin account not found in your school.");
    }
    if (!profile.is_active) {
      throw new AppError("Reactivate this Co-Admin before issuing a credential.",409);
    }
    if (!profile.must_change_password) {
      throw new AppError(
        "This Co-Admin has completed password setup. Use their own password recovery instead of resetting an active administrator's password.",
        409,
      );
    }

    const { data: authResult, error: lookupError } = await admin.auth.admin.getUserById(id);
    const authUser = authResult?.user;
    if (
      lookupError || !authUser ||
      authUser.email?.toLowerCase() !== profile.email.toLowerCase() ||
      authUser.app_metadata?.school_id !== schoolId ||
      authUser.app_metadata?.role !== "ADMIN" ||
      authUser.app_metadata?.admin_tier !== "CO_ADMIN" ||
      authUser.app_metadata?.must_change_password !== true
    ) {
      throw new AppError("Supabase Auth identity does not match the pending Co-Admin profile. No credentials changed.",409);
    }

    // Avoid accidental repeated issuance that would invalidate a credential
    // already copied by the Primary Administrator.
    const { data: recent, error: auditCheckError } = await admin.from("audit_logs")
      .select("id").eq("school_id",schoolId).eq("entity_type","co_admin")
      .eq("entity_id",id)
      .contains("metadata",{operation:"co_admin_temporary_password_issued"})
      .gte("created_at",new Date(Date.now()-120_000).toISOString())
      .limit(1);
    if (auditCheckError) throw new AppError("Cannot verify credential issuance audit history.",503);
    if (recent?.length) {
      throw new AppError("A temporary password was issued recently. Allow two minutes before replacing it again.",429);
    }

    const password = generateTemporaryPassword();
    const { error: resetError } = await admin.auth.admin.updateUserById(id,{
      password,
      // No role/school/admin tier changes are made.
    });
    if (resetError) {
      console.error("Co-Admin temporary credential issuance rejected",{
        status:resetError.status??0,code:resetError.code??"unknown",
      });
      throw new AppError("Supabase rejected the temporary credential. Check Auth administration logs.",503);
    }

    const { error: auditError } = await admin.from("audit_logs").insert({
      school_id:schoolId,user_id:session.authUserId,
      action:"PASSWORD_RESET_REQUESTED",entity_type:"co_admin",entity_id:id,
      metadata:{operation:"co_admin_temporary_password_issued",method:"primary_admin_pending_onboarding"},
    });
    if (auditError) console.error("Co-Admin credential issuance audit failed", {code:auditError.code});
    return NextResponse.json({
      email:profile.email,temporaryPassword:password,
      message:"Temporary password issued. Copy it now and share privately. The Co-Admin must change it on first login.",
    },{headers:{"Cache-Control":"no-store, private"}});
  } catch (error) { return handleApiError(error); }
}
