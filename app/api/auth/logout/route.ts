import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentSession } from "@/lib/auth/getCurrentSession";
import { recordAuditEntry } from "@/services/auditService";
import { handleApiError } from "@/lib/utils/errors";

export async function POST(request: NextRequest) {
  try {
    const session = await getCurrentSession();
    const supabase = await createClient();

    if (session) {
      await recordAuditEntry({
        schoolId: session.profile.school_id,
        userId: session.authUserId,
        action: "LOGOUT",
        entityType: "User",
        entityId: session.authUserId,
        request,
      });
    }

    await supabase.auth.signOut();
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error);
  }
}
