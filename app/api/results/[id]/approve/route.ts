import { NextResponse, type NextRequest } from "next/server";
import { requireSession } from "@/lib/auth/requireSession";
import { decideResultApproval } from "@/services/resultService";
import { resultApprovalSchema } from "@/lib/validations/result";
import { handleApiError } from "@/lib/utils/errors";

/** Body: { action: "APPROVE" | "REJECT", principalRemarks?, rejectionReason? } */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const input = resultApprovalSchema.parse({ ...body, resultId: id });
    const result = await decideResultApproval(session, input);
    return NextResponse.json({ result });
  } catch (error) {
    return handleApiError(error);
  }
}
