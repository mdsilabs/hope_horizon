import { NextResponse, type NextRequest } from "next/server";
import { requireSession } from "@/lib/auth/requireSession";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSchoolMediaSettings, uploadAvatarToCloudinary } from "@/lib/media/cloudinary";
import { AppError, handleApiError } from "@/lib/utils/errors";

export const runtime="nodejs";
export async function POST(request:NextRequest){
  try{
    const session=await requireSession();
    const media=await getSchoolMediaSettings(session.profile.school_id);
    if(!media || !media.enabled)throw new AppError("Profile photo uploads are not enabled. Contact the school administrator.",503);
    const authAdmin=createAdminClient();
    const {data:profile,error:readError}=await authAdmin.from("users")
      .select("id,school_id,is_active,avatar_uploaded_at").eq("id",session.authUserId)
      .eq("school_id",session.profile.school_id).maybeSingle();
    if(readError || !profile || !profile.is_active)throw new AppError("Account is inactive.",403);
    if(profile.avatar_uploaded_at && Date.now()-new Date(profile.avatar_uploaded_at).getTime()<60_000)
      throw new AppError("Please wait one minute between profile photo uploads.",429);
    const form=await request.formData();
    const file=form.get("file");
    if(!(file instanceof File))throw new AppError("Choose a profile photo first.",422);
    const url=await uploadAvatarToCloudinary(file,session.profile.school_id,media);
    // Privileged update is intentionally restricted to the authenticated user's own
    // verified school and profile; caller cannot supply avatar URLs.
    const {data,error}=await authAdmin.from("users").update({
      avatar_url:url,avatar_uploaded_at:new Date().toISOString(),
    }).eq("id",session.authUserId).eq("school_id",session.profile.school_id)
      .eq("is_active",true).select("avatar_url").single();
    if(error || !data)throw new AppError("Image uploaded, but the profile could not be updated.",502);
    return NextResponse.json({avatarUrl:data.avatar_url});
  }catch(e){return handleApiError(e);}
}
