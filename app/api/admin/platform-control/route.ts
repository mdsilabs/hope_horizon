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

    // Counts are computed in PostgreSQL against the same locked schema
    // expected by the operational reset. Earlier deployments show the
    // maintenance controls without enabling destructive actions.
    const preview=await admin.rpc("hh_platform_reset_counts",{p_school:session.profile.school_id});
    const version=await admin.rpc("hh_platform_reset_policy_version");
    const resetReady=!preview.error && !!preview.data && !version.error && version.data===2;
    const counts:Record<string,number>=resetReady?preview.data as Record<string,number>:{};
    const job=resetReady?await admin.from("platform_reset_jobs")
      .select("id,status,created_at,initial_account_count,pending_auth_ids")
      .eq("school_id",session.profile.school_id)
      .order("created_at",{ascending:false}).limit(1).maybeSingle():null;
    const latest=job?.data??null;
    const pending=latest?.status==="AUTH_CLEANUP_PENDING";
    return NextResponse.json({
      paused:control.data.paused,notice:control.data.notice,updatedAt:control.data.updated_at,
      schoolName:school.data.name,counts,
      resetReady,destructiveResetAvailable:resetReady &&
        process.env.PLATFORM_ENABLE_OPERATIONAL_RESET==="true" &&
        control.data.paused && !pending,
      resetWarning:!resetReady?"Apply guarded operational reset migration 0019 and administrator-preservation migration 0020 before enabling deletion.":
        "Only non-administrator school data and non-administrator logins are deleted. Every PRIMARY and CO_ADMIN remains. A restorable backup is mandatory.",
      latestReset:latest?{id:latest.id,status:latest.status,
        startedAt:latest.created_at,totalAuthAccounts:latest.initial_account_count,
        pendingAuthAccounts:latest.pending_auth_ids.length}:null,
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
    if(!desired){
      const {data:unfinished,error:unfinishedError}=await admin.from("platform_reset_jobs")
        .select("id").eq("school_id",session.profile.school_id)
        .eq("status","AUTH_CLEANUP_PENDING").limit(1);
      // Until 0019 is applied, the missing reset-job table is expected.
      if(unfinishedError&&!["42P01","PGRST205"].includes(unfinishedError.code))
        throw new AppError("Could not verify pending reset jobs. Do not resume.",503);
      if(unfinished?.length)
        throw new AppError("Finish deleting old sign-in accounts before resuming this school.",409);
    }
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
