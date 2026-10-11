import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/requireSession";
import { createClient } from "@/lib/supabase/server";
import { testCloudinaryConnection } from "@/lib/media/cloudinary";
import { AppError,handleApiError } from "@/lib/utils/errors";

export const runtime="nodejs";
export async function POST(){
  try{
    const session=await requireRole(["ADMIN"]);
    const db=await createClient();
    const {data,error}=await db.from("school_media_settings")
      .select("cloud_name").eq("school_id",session.profile.school_id).maybeSingle();
    if(error)throw error;
    if(!data)throw new AppError("Save your Cloudinary settings first.",422);
    const result=await testCloudinaryConnection(data.cloud_name);
    if(!result)throw new AppError("Cloudinary authentication failed. Verify your Vercel API key, secret, and cloud name.",502);
    return NextResponse.json({message:"Cloudinary credentials authenticated successfully. No images were uploaded."});
  }catch(e){return handleApiError(e);}
}
