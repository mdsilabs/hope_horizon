import { NextResponse, type NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/requireSession";
import { createClient } from "@/lib/supabase/server";
import { mediaSettingsSchema } from "@/lib/validations/profile-media";
import { assertMatchingCloudName, hasCloudinaryCredentials } from "@/lib/media/cloudinary";
import { handleApiError } from "@/lib/utils/errors";

export async function GET(){
  try{
    const session=await requireRole(["ADMIN"]);
    const db=await createClient();
    const {data,error}=await db.from("school_media_settings")
      .select("cloud_name,folder,enabled").eq("school_id",session.profile.school_id)
      .maybeSingle();
    if(error)throw error;
    return NextResponse.json({settings:data??{cloud_name:"",folder:"avatars",enabled:false},
      credentialsConfigured:hasCloudinaryCredentials(),
      cloudNamePinned:Boolean(process.env.CLOUDINARY_CLOUD_NAME)});
  }catch(e){return handleApiError(e);}
}
export async function PUT(request:NextRequest){
  try{
    const session=await requireRole(["ADMIN"]);
    const input=mediaSettingsSchema.parse(await request.json());
    assertMatchingCloudName(input.cloudName);
    const db=await createClient();
    const {data,error}=await db.from("school_media_settings").upsert({
      school_id:session.profile.school_id,cloud_name:input.cloudName,
      folder:input.folder,enabled:input.enabled,
    },{onConflict:"school_id"}).select("cloud_name,folder,enabled").single();
    if(error)throw error;
    const {error:auditError}=await db.from("audit_logs").insert({
      school_id:session.profile.school_id,user_id:session.authUserId,
      action:"SYSTEM_SETTING_CHANGED",entity_type:"cloudinary_settings",
      entity_id:session.profile.school_id,metadata:{enabled:input.enabled},
    });
    if(auditError)console.error("Cloudinary settings audit logging failed.");
    return NextResponse.json({settings:data,credentialsConfigured:hasCloudinaryCredentials()});
  }catch(e){return handleApiError(e);}
}
