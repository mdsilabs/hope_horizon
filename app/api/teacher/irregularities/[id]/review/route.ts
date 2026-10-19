import {NextResponse,type NextRequest} from "next/server";
import {requireRole} from "@/lib/auth/requireSession";
import {createClient} from "@/lib/supabase/server";
import {classIrregularityDecisionSchema} from "@/lib/validations/irregularities";
import {uuidString} from "@/lib/validations/common";
import {AppError,handleApiError} from "@/lib/utils/errors";

export async function POST(request:NextRequest,{params}:{params:Promise<{id:string}>}){
  try{
    await requireRole(["TEACHER"]);
    const id=uuidString.parse((await params).id);
    const decision=classIrregularityDecisionSchema.parse(await request.json());
    const db=await createClient();
    const {data,error}=await db.rpc("hh_class_review_irregularity",{
      p_request_id:id,p_action:decision.action,p_note:decision.note,
    });
    if(error){
      if(error.code==="PGRST202")throw new AppError("Install migration 0015 to review requests.",503,"MIGRATION_REQUIRED");
      if(["42501","22023"].includes(error.code))throw new AppError(error.message,error.code==="42501"?403:422);
      throw error;
    }
    return NextResponse.json({status:data,message:decision.action==="ENDORSE"
      ?"Request endorsed and sent to the school administrator."
      :"Request rejected; the teacher can view the reason."});
  }catch(error){return handleApiError(error);}
}