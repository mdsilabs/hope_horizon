import {NextResponse,type NextRequest} from "next/server";
import {z} from "zod";
import {createAdminClient} from "@/lib/supabase/admin";
import {requirePlatformOwner} from "@/lib/platform/owner";
import {AppError,AuthorizationError,handleApiError} from "@/lib/utils/errors";

const actionSchema=z.object({
  action:z.enum(["PAUSE","RESUME"]),
  confirmation:z.string().max(160),
  reason:z.string().trim().min(10).max(350).optional(),
}).strict();

export async function GET(){
  try{
    const session=await requirePlatformOwner();
    const admin=createAdminClient();
    const [control,school]=await Promise.all([
      admin.from("platform_installation_controls")
        .select("paused,notice,updated_at").eq("id",1).single(),
      admin.from("schools").select("id,name").eq("id",session.profile.school_id).single(),
    ]);
    if(control.error||!control.data)throw new AppError("Apply installation migration 0018 first.",503,"MIGRATION_REQUIRED");
    if(school.error||!school.data)throw new AppError("School unavailable.",503);

    // Read-only counts for the owner to understand a potential full reset.
    // This endpoint never issues DELETE, TRUNCATE or schema changes.
    const tables=["students","teachers","parents","classes","subjects","terms",
      "academic_sessions","results","notifications","users"] as const;
    const counts:Record<string,number|null>={};
    for(const table of tables){
      const {count,error}=await admin.from(table)
        .select("id",{head:true,count:"exact"})
        .eq("school_id",session.profile.school_id);
      counts[table]=error?null:count;
    }
    return NextResponse.json({
      paused:control.data.paused,notice:control.data.notice,updatedAt:control.data.updated_at,
      schoolName:school.data.name,counts,
      destructiveResetAvailable:false,
      resetWarning:"Preview only. Full reset needs separately approved scope and a verified restorable backup.",
    },{headers:{"Cache-Control":"no-store, private"}});
  }catch(e){return handleApiError(e);}
}

export async function POST(request:NextRequest){
  try{
    const session=await requirePlatformOwner();
    const origin=request.headers.get("origin");
    if(!origin||origin!==new URL(request.url).origin)
      throw new AuthorizationError("Submit platform controls from the school's portal origin.");
    const body=actionSchema.parse(await request.json());
    const admin=createAdminClient();
    const {data:school,error:schoolError}=await admin.from("schools")
      .select("name").eq("id",session.profile.school_id).single();
    if(schoolError||!school)throw new AppError("School unavailable.",503);
    const expected=(body.action==="PAUSE"?"PAUSE ":"RESUME ")+school.name;
    if(body.confirmation!==expected)throw new AppError("Confirmation does not match the exact action and school name.",422);
    if(body.action==="PAUSE"&&!body.reason)
      throw new AppError("Provide a maintenance reason of at least 10 characters.",422);

    const {data:current,error:controlError}=await admin.from("platform_installation_controls")
      .select("id,paused").eq("id",1).single();
    if(controlError||!current)throw new AppError("Apply migration 0018 first.",503,"MIGRATION_REQUIRED");
    const desired=body.action==="PAUSE";
    if(current.paused===desired)throw new AppError(
      desired?"The portal is already paused.":"The portal is already running.",409);

    const {error}=await admin.from("platform_installation_controls")
      .update({
        paused:desired,
        notice:desired?body.reason!:"The school portal is temporarily unavailable for maintenance.",
        updated_at:new Date().toISOString(),updated_by:session.authUserId,
      }).eq("id",1).eq("paused",!desired);
    if(error)throw new AppError("Could not update maintenance status.",503);
    const {error:auditError}=await admin.from("audit_logs").insert({
      school_id:session.profile.school_id,user_id:session.authUserId,
      action:"SYSTEM_SETTING_CHANGED",entity_type:"platform_maintenance",
      metadata:{operation:desired?"installation_paused":"installation_resumed",reason:body.reason??""},
    });
    if(auditError)console.error("Installation maintenance audit write failed.");
    return NextResponse.json({paused:desired,message:desired?
      "Portal paused. End-user pages and API routes are blocked; database writes are locked.":
      "Portal resumed and normal school operations restored."},
      {headers:{"Cache-Control":"no-store, private"}});
  }catch(e){return handleApiError(e);}
}
