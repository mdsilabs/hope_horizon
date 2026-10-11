import { NextResponse,type NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/requireSession";
import { createClient } from "@/lib/supabase/server";
import { AppError,handleApiError } from "@/lib/utils/errors";

export async function GET(request:NextRequest){
  try{
    const session=await requireRole(["ADMIN"]);
    const q=(request.nextUrl.searchParams.get("q")||"").trim();
    const page=Number(request.nextUrl.searchParams.get("page")||"1");
    if(q.length>80 || !Number.isSafeInteger(page) || page<1 || page>1000)
      throw new AppError("Invalid search or page number.",422);
    const db=await createClient();
    let query=db.from("users")
      .select("id,name,email,role,admin_tier,phone,whatsapp_number,avatar_url,is_active,last_login_at",{count:"exact"})
      .eq("school_id",session.profile.school_id);
    if(q)query=query.or("name.ilike.%"+q.replace(/[%,().\\]/g,"")+"%,email.ilike.%"+q.replace(/[%,().\\]/g,"")+"%");
    const {data,count,error}=await query.order("name").range((page-1)*25,page*25-1);
    if(error)throw error;
    return NextResponse.json({users:data??[],total:count??0,page,pageSize:25});
  }catch(e){return handleApiError(e);}
}
