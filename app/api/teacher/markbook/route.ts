import {NextResponse,type NextRequest} from "next/server";
import {requireRole} from "@/lib/auth/requireSession";
import {createClient} from "@/lib/supabase/server";
import {markbookSaveSchema} from "@/lib/validations/compilation";
import {uuidString} from "@/lib/validations/common";
import {AppError,handleApiError} from "@/lib/utils/errors";

export async function GET(request:NextRequest){
  try{
    const session=await requireRole(["TEACHER"]);
    const db=await createClient(),schoolId=session.profile.school_id;
    const {data:teacher,error:teacherError}=await db.from("teachers").select("id")
      .eq("school_id",schoolId).eq("user_id",session.authUserId).eq("is_active",true).maybeSingle();
    if(teacherError)throw teacherError;
    if(!teacher)throw new AppError("Ask an administrator to assign your teacher profile.",403);
    const [{data:school,error:schoolError},{data:raw,error:assignedError}]=await Promise.all([
      db.from("schools").select("current_term_id,ca_max_score,exam_max_score")
        .eq("id",schoolId).single(),
      db.from("teacher_subject_assignments")
        .select("class_id,subject_id,classes(name,arm,is_active),subjects(name,code,ca_max_score_override,exam_max_score_override,is_active)")
        .eq("teacher_id",teacher.id),
    ]);
    if(schoolError||assignedError)throw schoolError||assignedError;
    const assignments=(raw??[]).filter(a=>a.classes?.is_active && a.subjects?.is_active)
      .map(a=>({classId:a.class_id,subjectId:a.subject_id,
        className:a.classes!.name+(a.classes!.arm?" "+a.classes!.arm:""),
        subjectName:a.subjects!.name,subjectCode:a.subjects!.code,
        caMax:a.subjects!.ca_max_score_override??school!.ca_max_score,
        examMax:a.subjects!.exam_max_score_override??school!.exam_max_score}));
    const classId=request.nextUrl.searchParams.get("classId");
    const subjectId=request.nextUrl.searchParams.get("subjectId");
    if(!classId||!subjectId)return NextResponse.json({termId:school?.current_term_id,assignments,students:[],marks:[]});
    uuidString.parse(classId);uuidString.parse(subjectId);
    if(!assignments.some(a=>a.classId===classId&&a.subjectId===subjectId))
      throw new AppError("This class and subject are not assigned to you.",403);
    if(!school?.current_term_id)throw new AppError("No active term. Ask your school administrator.",422);
    const [{data:students,error:studentsError},{data:marks,error:marksError}]=await Promise.all([
      db.from("students").select("id,full_name,admission_number").eq("school_id",schoolId)
        .eq("class_id",classId).eq("is_active",true).order("full_name").limit(250),
      db.from("subject_markbooks").select("student_id,ca,exam,status")
        .eq("school_id",schoolId).eq("class_id",classId).eq("subject_id",subjectId)
        .eq("term_id",school.current_term_id).limit(250),
    ]);
    if(studentsError||marksError)throw studentsError||marksError;
    return NextResponse.json({termId:school.current_term_id,assignments,students:students??[],marks:marks??[]});
  }catch(e){return handleApiError(e);}
}
export async function POST(request:NextRequest){
  try{
    await requireRole(["TEACHER"]);
    const input=markbookSaveSchema.parse(await request.json());
    const db=await createClient();
    const {data,error}=await db.rpc("hh_save_subject_markbook",{
      p_class_id:input.classId,p_subject_id:input.subjectId,p_term_id:input.termId,
      p_scores:input.scores,p_submit:input.submit,
    });
    if(error){
      if(error.code==="PGRST202")throw new AppError("Apply SQL migration 0009 first.",503);
      if(["42501","22023","23514","23503"].includes(error.code))
        throw new AppError(error.message,422);
      throw error;
    }
    return NextResponse.json({count:data,status:input.submit?"SUBMITTED":"DRAFT"});
  }catch(e){return handleApiError(e);}
}
