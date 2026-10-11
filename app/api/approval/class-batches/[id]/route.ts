import {NextResponse,type NextRequest} from "next/server";
import {requireRole} from "@/lib/auth/requireSession";
import {createClient} from "@/lib/supabase/server";
import {uuidString} from "@/lib/validations/common";
import {batchDecisionSchema} from "@/lib/validations/compilation";
import {AppError,handleApiError} from "@/lib/utils/errors";

export async function GET(_request:NextRequest,{params}:{params:Promise<{id:string}>}){
  try{
    const session=await requireRole(["PRINCIPAL","ADMIN"]);
    const id=uuidString.parse((await params).id);
    const db=await createClient(),schoolId=session.profile.school_id;
    const {data:batch,error}=await db.from("class_result_batches")
      .select("id,class_id,term_id,status,submitted_at,decision_remarks,classes(name,arm),terms(name)")
      .eq("id",id).eq("school_id",schoolId).maybeSingle();
    if(error)throw error;
    if(!batch)throw new AppError("Class compilation not found.",404);
    const {data:results,error:resultsError}=await db.from("results")
      .select("id,student_id,overall_total,overall_average,overall_position,status,students(full_name,admission_number),result_subject_scores(ca,exam,total,grade,subjects(name,code))")
      .eq("school_id",schoolId).eq("class_id",batch.class_id).eq("term_id",batch.term_id)
      .order("overall_position",{ascending:true}).limit(250);
    if(resultsError)throw resultsError;
    return NextResponse.json({batch,results:results??[]});
  }catch(e){return handleApiError(e);}
}
export async function POST(request:NextRequest,{params}:{params:Promise<{id:string}>}){
  try{
    await requireRole(["PRINCIPAL","ADMIN"]);
    const id=uuidString.parse((await params).id);
    const input=batchDecisionSchema.parse(await request.json());
    const db=await createClient();
    const {data,error}=await db.rpc("hh_head_decide_class_batch",{
      p_batch_id:id,p_action:input.action,p_remarks:input.remarks,
    });
    if(error){
      if(error.code==="PGRST202")throw new AppError("Apply migration 0009 to enable class approvals.",503);
      if(["42501","22023"].includes(error.code))throw new AppError(error.message,422);
      throw error;
    }
    return NextResponse.json({success:data===true});
  }catch(e){return handleApiError(e);}
}
