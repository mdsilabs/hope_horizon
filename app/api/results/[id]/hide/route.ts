import { NextResponse, type NextRequest } from "next/server";
import { requireSession } from "@/lib/auth/requireSession";
import { hideResult } from "@/services/resultService";
import { handleApiError } from "@/lib/utils/errors";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const result = await hideResult(session, id);
    return NextResponse.json({ result });
  } catch (error) {
    return handleApiError(error);
  }
}
