import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/requireSession";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { teacherProvisionSchema } from "@/lib/validations/admin-workflows";
import { ConflictError, AppError, handleApiError } from "@/lib/utils/errors";

export async function GET() {
  try {
    const session = await requireRole(["ADMIN"]);
    const db = await createClient();
    const { data, error } = await db.from("teachers")
      .select("id, full_name, staff_id, user_id, is_active, users(email, is_active), teacher_classes(class_id), teacher_subject_assignments(class_id,subject_id)")
      .eq("school_id", session.profile.school_id).order("full_name").limit(250);
    if (error) throw error;
    return NextResponse.json({ teachers: data ?? [] });
  } catch (e) { return handleApiError(e); }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireRole(["ADMIN"]);
    const input = teacherProvisionSchema.parse(await request.json());
    const db = await createClient();
    const schoolId = session.profile.school_id;

    // Fail closed if hardened metadata provisioning/migration is not deployed.
    const { data: capabilities, error: probeError } = await db.rpc("hh_portal_capabilities");
    if (probeError || !capabilities?.authorization_guard || !capabilities?.auth_trigger) {
      throw new AppError("Apply Supabase migrations 0004 and 0005 before creating staff accounts.", 503, "MIGRATION_REQUIRED");
    }

    const { data: duplicate, error: duplicateError } = await db.from("teachers")
      .select("id").eq("school_id", schoolId).eq("staff_id", input.staffId).maybeSingle();
    if (duplicateError) throw duplicateError;
    if (duplicate) throw new ConflictError("A teacher already uses this staff ID.");

    const admin = createAdminClient();
    // A random, undisclosed password is replaced through the teacher's own email.
    const tempPassword = randomBytes(36).toString("base64url") + "Aa1!";
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: input.email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { name: input.fullName },
      app_metadata: { school_id: schoolId, role: "TEACHER", must_change_password: true },
    });
    if (createError || !created.user) {
      throw new ConflictError("Unable to create account. Check whether the email is already registered.");
    }

    const { data: teacher, error: insertError } = await db.from("teachers")
      .insert({ school_id: schoolId, user_id: created.user.id,
        full_name: input.fullName, staff_id: input.staffId })
      .select("id, full_name, staff_id").single();
    if (insertError || !teacher) {
      const cleanup = await admin.auth.admin.deleteUser(created.user.id);
      if (cleanup.error) console.error("Teacher provision cleanup failed", cleanup.error);
      if (insertError?.code === "23505") throw new ConflictError("This teacher or staff ID already exists.");
      throw new AppError("Teacher profile could not be created. Check database setup.", 500);
    }

    const { error: auditError } = await db.from("audit_logs").insert({
      school_id: schoolId, user_id: session.authUserId,
      action: "TEACHER_CREATED", entity_type: "teacher", entity_id: teacher.id,
    });
    if (auditError) console.error("Teacher audit error", auditError);

    // Redirect must be a trusted application-controlled URL, not Host header.
    const origin = process.env.NEXT_PUBLIC_APP_URL;
    let emailStatus: "requested" | "not_sent" = "not_sent";
    if (origin) {
      try {
        const parsed = new URL(origin);
        if (parsed.protocol === "https:" || (parsed.hostname === "localhost" && parsed.protocol === "http:")) {
          const { error: mailError } = await admin.auth.resetPasswordForEmail(input.email, {
            redirectTo: new URL("/reset-password", parsed).toString(),
          });
          if (mailError) console.error("Teacher setup email request failed", mailError);
          else emailStatus = "requested";
        }
      } catch (err) { console.error("Unusable configured NEXT_PUBLIC_APP_URL", err); }
    }
    return NextResponse.json({ teacher, emailStatus,
      message: emailStatus === "requested"
        ? "Teacher created. Password-setup email requested; verify delivery with the teacher."
        : "Teacher created, but the setup email could not be requested. Check the app URL and email settings, then resend." },
      { status: 201 });
  } catch (e) { return handleApiError(e); }
}
