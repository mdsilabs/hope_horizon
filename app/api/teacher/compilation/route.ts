import {NextResponse,type NextRequest} from "next/server";
import {requireRole} from "@/lib/auth/requireSession";
import {createClient} from "@/lib/supabase/server";
import {classCompileSchema} from "@/lib/validations/compilation";
import {AppError,handleApiError} from "@/lib/utils/errors";

export async function GET(){
  try{
    const session=await requireRole(["TEACHER"]);
    const db=await createClient(),schoolId=session.profile.school_id;
    const {data:teacher,error:teacherError}=await db.from("teachers")
      .select("id").eq("user_id",session.authUserId).eq("school_id",schoolId)
      .eq("is_active",true).maybeSingle();
    if(teacherError)throw teacherError;
    if(!teacher)throw new AppError("No active teacher profile found.",403);
    const [{data:school,error:schoolError},{data:classLinks,error:linksError}]=await Promise.all([
      db.from("schools").select("current_term_id").eq("id",schoolId).single(),
      db.from("teacher_classes").select("class_id,classes(name,arm,is_active)")
        .eq("teacher_id",teacher.id),
    ]);
    if(schoolError||linksError)throw schoolError||linksError;
    const termId=school?.current_term_id??null;
    const classes=await Promise.all((classLinks??[]).filter(c=>c.classes?.is_active).map(async c=>{
      const classId=c.class_id;
      const [students,subjects,marks,batch]=await Promise.all([
        db.from("students").select("id",{count:"exact",head:true})
          .eq("school_id",schoolId).eq("class_id",classId).eq("is_active",true),
        db.from("class_subjects").select("subject_id,subjects!inner(is_active)",{count:"exact",head:true})
          .eq("class_id",classId).eq("subjects.is_active",true),
        termId?db.from("subject_markbooks").select("id",{count:"exact",head:true})
          .eq("school_id",schoolId).eq("class_id",classId)
          .eq("term_id",termId).eq("status","SUBMITTED"):null,
        termId?db.from("class_result_batches").select("id,status,decision_remarks")
          .eq("class_id",classId).eq("term_id",termId).maybeSingle():null,
      ]);
      if(students.error||subjects.error||marks?.error||batch?.error)
        throw new AppError("Could not calculate class readiness. Apply migration 0009.",503);
      const studentCount=students.count??0, subjectCount=subjects.count??0;
      return {classId,className:c.classes!.name+(c.classes!.arm?" "+c.classes!.arm:""),
        studentCount,subjectCount,expected:studentCount*subjectCount,
        submitted:marks?.count??0,batch:batch?.data??null};
    }));
    return NextResponse.json({termId,classes});
  }catch(e){return handleApiError(e);}
}
export async function POST(request:NextRequest){
  try{
    await requireRole(["TEACHER"]);
    const input=classCompileSchema.parse(await request.json());
    const db=await createClient();
    const {data,error}=await db.rpc("hh_compile_class_results",{
      p_class_id:input.classId,p_term_id:input.termId,
    });
    if(error){
      if(error.code==="PGRST202")throw new AppError("Apply SQL migration 0009 first.",503);
      if(["42501","22023","23505","23503"].includes(error.code))
        throw new AppError(error.message,422);
      throw error;
    }
    return NextResponse.json({count:data,message:"Class compiled and sent for head-of-school review."});
  }catch(e){return handleApiError(e);}
}
