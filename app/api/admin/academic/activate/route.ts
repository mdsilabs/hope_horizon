import { NextResponse, type NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/requireSession";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";
import { uuidString } from "@/lib/validations/common";
import { AppError, handleApiError } from "@/lib/utils/errors";

const schema=z.object({termId:uuidString}).strict();

export async function POST(request:NextRequest) {
  try {
    const session=await requireRole(["ADMIN"]);
    const {termId}=schema.parse(await request.json());
    const db=await createClient();
    const {data,error}=await db.rpc("hh_admin_activate_term",{p_term_id:termId});
    if (error?.code==="PGRST202") throw new AppError("Apply database migration 0005 before activating terms.",503,"MIGRATION_REQUIRED");
    if (error?.code==="22023" || error?.code==="42501") throw new AppError("Term is unavailable for this school.",422);
    if (error) throw error;
    return NextResponse.json({success:data});
  } catch(e) {return handleApiError(e);}
}
