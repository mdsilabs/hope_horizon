import {NextResponse,type NextRequest} from "next/server";
import {z} from "zod";
import {createAdminClient} from "@/lib/supabase/admin";
import {requirePlatformOwner} from "@/lib/platform/owner";
import {AppError,AuthorizationError,handleApiError} from "@/lib/utils/errors";

const resetSchema=z.discriminatedUnion("action",[
  z.object({
    action:z.literal("RESET_OPERATIONAL"),
    expectedCounts:z.record(z.number().int().nonnegative()),
    confirmation:z.string().min(20).max(250),
    backupReference:z.string().trim().min(12).max(200),
    backupRestoredAndVerified:z.literal(true),
    acknowledgePermanentDeletion:z.literal(true),
  }).strict(),
  z.object({
    action:z.literal("CLEANUP_AUTH"),
    jobId:z.string().uuid(),
  }).strict(),
]);

export async function POST(request:NextRequest){
  try{
    const session=await requirePlatformOwner();
    if(process.env.PLATFORM_ENABLE_OPERATIONAL_RESET!=="true")
      throw new AuthorizationError("Reset is disabled on this installation. Enable the private operational-reset setting first.");
    const origin=request.headers.get("origin");
    if(!origin||origin!==new URL(request.url).origin)
      throw new AuthorizationError("Use the school's portal to perform this sensitive operation.");
    const input=resetSchema.parse(await request.json());
    const admin=createAdminClient();
    const [control,school]=await Promise.all([
      admin.from("platform_installation_controls").select("paused").eq("id",1).single(),
      admin.from("schools").select("name,id").eq("id",session.profile.school_id).single(),
    ]);
    if(control.error||!control.data||!control.data.paused)
      throw new AppError("Pause this installation before resetting operational school data.",409);
    if(school.error||!school.data)throw new AppError("School configuration not found.",503);

    if(input.action==="RESET_OPERATIONAL"){
      // Exact-case confirmation and supplied backup evidence. A free-text
      // reference is an operator attestation, NOT technical backup verification.
      const phrase="RESET OPERATIONAL DATA FOR "+school.data.name;
      if(input.confirmation!==phrase)
        throw new AppError("Reset confirmation must match the full school name exactly.",422);
      const {data,error}=await admin.rpc("hh_platform_reset_operational",{
        p_school:session.profile.school_id,
        p_actor:session.authUserId,
        p_expected:input.expectedCounts,
        p_confirmation:input.confirmation,
        p_backup_reference:input.backupReference,
      });
      if(error){
        if(["PGRST202","42P01"].includes(error.code))
          throw new AppError("Apply migration 0019 before attempting a reset.",503,"MIGRATION_REQUIRED");
        throw new AppError("Reset was not committed: "+error.message,409,"RESET_GUARD_REJECTED");
      }
      return NextResponse.json({
        jobId:data,
        message:"Operational database transaction completed. Continue the Supabase Auth account cleanup before resuming.",
      },{status:202,headers:{"Cache-Control":"no-store, private"}});
    }

    // Postgres and Supabase Auth cannot participate in the same database
    // transaction. Persist every cleanup ID and perform a resumable batch.
    const {data:job,error:jobError}=await admin.from("platform_reset_jobs")
      .select("id,school_id,primary_admin_id,status,pending_auth_ids")
      .eq("id",input.jobId).eq("school_id",session.profile.school_id)
      .eq("primary_admin_id",session.authUserId).maybeSingle();
    if(jobError||!job)throw new AppError("Reset cleanup job not found for this owner.",404);
    if(job.status==="COMPLETED")
      return NextResponse.json({remaining:0,removed:0,complete:true,message:"All Auth accounts were cleaned."});
    let removed=0;
    let firstFailure="";
    for(const userId of job.pending_auth_ids.slice(0,12)){
      if(userId===session.authUserId){
        firstFailure="Original Super Admin appeared in the deletion queue. Cleanup halted.";
        break;
      }
      const {error:removeError}=await admin.auth.admin.deleteUser(userId);
      if(removeError&&removeError.status!==404){
        // Usually: Auth account owns objects in Supabase Storage or a
        // database dependency still needs manual cleanup. Never resume.
        firstFailure="An Auth user could not be deleted; check Auth and Storage dependencies.";
        console.error("Super Admin Auth cleanup paused",{
          job:job.id,code:removeError.code,status:removeError.status,
        });
        break;
      }
      const {error:recordError}=await admin.rpc("hh_platform_reset_auth_done",{
        p_job:job.id,p_user:userId,
      });
      if(recordError){
        firstFailure="Auth deletion succeeded but recording the cleanup failed. Retry this step.";
        console.error("Reset cleanup progress save failed",{
          job:job.id,code:recordError.code,
        });
        break;
      }
      removed++;
    }
    const {data:latest,error:latestError}=await admin.from("platform_reset_jobs")
      .select("status,pending_auth_ids").eq("id",job.id).single();
    if(latestError||!latest)throw new AppError("Cannot verify cleanup progress. Keep the portal paused.",503);
    const remaining=latest.pending_auth_ids.length;
    return NextResponse.json({
      complete:latest.status==="COMPLETED"&&remaining===0,removed,remaining,
      message:firstFailure||(
        remaining===0?"Operational reset finished. You may now resume the portal.":
        "Old user accounts are still being deleted; continue cleanup before resuming."
      ),
    },{status:firstFailure?409:200,headers:{"Cache-Control":"no-store, private"}});
  }catch(error){return handleApiError(error);}
}
