import { NextResponse, type NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/requireSession";
import { createClient } from "@/lib/supabase/server";
import { AppError, handleApiError } from "@/lib/utils/errors";

export async function GET(request:NextRequest){
  try {
    const session=await requireRole(["ADMIN"]);
    const q=(request.nextUrl.searchParams.get("q")||"").trim();
    if(q.length>80)throw new AppError("Search must be 80 characters or fewer.",422);
    const db=await createClient();
    let query=db.from("students").select("id,full_name,admission_number,class_id")
      .eq("school_id",session.profile.school_id).eq("is_active",true);
    if(q) query=query.ilike("full_name","%"+q.replace(/[%_\\]/g,"\\$&")+"%");
    const {data,error}=await query.order("full_name",{ascending:true}).limit(50);
    if(error)throw error;
    return NextResponse.json({students:data??[]});
  }catch(e){return handleApiError(e);}
}
