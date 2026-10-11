import { NextResponse, type NextRequest } from "next/server";
import { requireSession } from "@/lib/auth/requireSession";
import { createClient } from "@/lib/supabase/server";
import { profilePatchSchema } from "@/lib/validations/profile-media";
import { handleApiError } from "@/lib/utils/errors";

export async function GET() {
  try {
    const session=await requireSession();
    const {id,name,email,role,phone,whatsapp_number,avatar_url}=session.profile;
    return NextResponse.json({profile:{id,name,email,role,phone,whatsapp_number,avatar_url}});
  }catch(e){return handleApiError(e);}
}
export async function PATCH(request:NextRequest){
  try{
    const session=await requireSession();
    const input=profilePatchSchema.parse(await request.json());
    const db=await createClient();
    const {data,error}=await db.from("users").update({
      name:input.name,phone:input.phone||null,whatsapp_number:input.whatsappNumber||null,
    }).eq("id",session.authUserId).eq("school_id",session.profile.school_id)
      .select("id,name,email,phone,whatsapp_number,avatar_url,role").single();
    if(error)throw error;
    return NextResponse.json({profile:data});
  }catch(e){return handleApiError(e);}
}
