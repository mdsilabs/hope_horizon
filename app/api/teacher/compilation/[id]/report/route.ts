import {NextResponse,type NextRequest} from "next/server";
import {requireRole} from "@/lib/auth/requireSession";
import {createClient} from "@/lib/supabase/server";
import {classReportEntriesSchema} from "@/lib/validations/report-release";
import {uuidString} from "@/lib/validations/common";
import {AppError,handleApiError} from "@/lib/utils/errors";

/** Attendance + teacher remarks are class-teacher only; membership verified in SQL. */
export async function POST(request:NextRequest,{params}:{params:Promise<{id:string}>}){
 try{
  const session=await requireRole(["TEACHER"]);
  const id=uuidString.parse((await params).id);
  const body=classReportEntriesSchema.parse(await request.json());
  const db=await createClient();
  const {data:school,error:schoolError}=await db.from("schools").select("current_term_id").eq("id",session.profile.school_id).single();
  if(schoolError||!school?.current_term_id)throw new AppError("No active school term.",422);
  const {data,error}=await db.rpc("hh_save_class_report_entries",{
   p_class_id:id,p_term_id:school.current_term_id,p_entries:body.entries,
  });
  if(error){
   if(error.code==="PGRST202")throw new AppError("Install SQL migration 0011 first.",503);
   if(["22023","42501","23514","23503"].includes(error.code))
    throw new AppError(error.message,422);
   throw error;
  }
  return NextResponse.json({saved:data,message:"Attendance and teacher remarks saved for the class."});
 }catch(e){return handleApiError(e);}
}
