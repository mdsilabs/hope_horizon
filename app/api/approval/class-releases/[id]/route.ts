import {NextResponse,type NextRequest} from "next/server";
import {requireRole} from "@/lib/auth/requireSession";
import {createClient} from "@/lib/supabase/server";
import {uuidString} from "@/lib/validations/common";
import {classPublicationActionSchema} from "@/lib/validations/report-release";
import {AppError,handleApiError} from "@/lib/utils/errors";

/** Atomic class release/withdrawal, never a loop of per-student API writes. */
export async function POST(request:NextRequest,{params}:{params:Promise<{id:string}>}){
 try{
  await requireRole(["ADMIN","PRINCIPAL"]);
  const id=uuidString.parse((await params).id);
  const {action}=classPublicationActionSchema.parse(await request.json());
  const db=await createClient();
  const {data,error}=await db.rpc("hh_release_class_batch",{
   p_batch_id:id,p_action:action,
  });
  if(error){
   if(error.code==="PGRST202")throw new AppError("Install SQL migration 0011 first.",503);
   if(["22023","42501","23514","23503","23505"].includes(error.code))
    throw new AppError(error.message,error.code==="42501"?403:422);
   throw error;
  }
  return NextResponse.json({count:data,
   message:action==="PUBLISH"?"All approved class results published together.":
    "All published results for the class withdrawn together."});
 }catch(e){return handleApiError(e);}
}
