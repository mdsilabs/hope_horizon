import {NextResponse,type NextRequest} from "next/server";
import {requireRole} from "@/lib/auth/requireSession";
import {createClient} from "@/lib/supabase/server";
import {classReviewActionSchema} from "@/lib/validations/class-review";
import {uuidString} from "@/lib/validations/common";
import {AppError,handleApiError} from "@/lib/utils/errors";
import {createAdminClient} from "@/lib/supabase/admin";
import {sendNotification} from "@/services/notificationService";
import {gmailSmtpConfigured} from "@/lib/email/gmail-smtp";

async function classScope(classId:string,actorId:string,schoolId:string){
 const db=await createClient();
 const {data:teacher,error}=await db.from("teachers").select("id")
  .eq("school_id",schoolId).eq("user_id",actorId).eq("is_active",true).maybeSingle();
 if(error)throw error;
 if(!teacher)throw new AppError("An active teacher account is required.",403);
 const {data:assignment,error:classError}=await db.from("teacher_classes")
  .select("class_id").eq("class_id",classId).eq("teacher_id",teacher.id).maybeSingle();
 if(classError)throw classError;
 if(!assignment)throw new AppError("You are not the assigned class teacher.",403);
 const [{data:school,error:schoolError},{data:cls,error:classFindError}]=await Promise.all([
  db.from("schools").select("current_term_id").eq("id",schoolId).single(),
  db.from("classes").select("id,name,arm,is_active").eq("id",classId)
    .eq("school_id",schoolId).eq("is_active",true).maybeSingle(),
 ]);
 if(schoolError||classFindError)throw schoolError||classFindError;
 if(!school?.current_term_id||!cls)throw new AppError("Active class and current term are required.",422);
 return {db,termId:school.current_term_id,cls};
}

export async function GET(_request:NextRequest,{params}:{params:Promise<{id:string}>}){
 try{
  const session=await requireRole(["TEACHER"]);
  const classId=uuidString.parse((await params).id);
  const {db,termId,cls}=await classScope(classId,session.authUserId,session.profile.school_id);
  const schoolId=session.profile.school_id;
  const [students,subjects,marks,corrections,signoff,batch]=await Promise.all([
   db.from("students").select("id,full_name,admission_number").eq("school_id",schoolId)
     .eq("class_id",classId).eq("is_active",true).order("full_name").limit(250),
   db.from("class_subjects").select("subject_id,subjects!inner(name,code,is_active)")
     .eq("class_id",classId).eq("subjects.is_active",true),
   db.from("subject_markbooks").select("student_id,subject_id,ca,exam,status,updated_at")
     .eq("school_id",schoolId).eq("class_id",classId).eq("term_id",termId).limit(15000),
   db.from("class_subject_corrections").select("id,subject_id,reason,requested_at,resolved_at")
     .eq("school_id",schoolId).eq("class_id",classId).eq("term_id",termId)
     .order("requested_at",{ascending:false}).limit(200),
   db.from("class_result_review_signoffs").select("reviewed_at,reviewed_by,checked_rows")
     .eq("school_id",schoolId).eq("class_id",classId).eq("term_id",termId).maybeSingle(),
   db.from("class_result_batches").select("id,status,decision_remarks")
     .eq("school_id",schoolId).eq("class_id",classId).eq("term_id",termId).maybeSingle(),
  ]);
  for(const res of [students,subjects,marks,corrections,signoff,batch])
   if(res.error)throw new AppError("Review records could not be loaded. Apply migration 0010.",503);
  const orderedSubjects=(subjects.data??[]).map(item=>({
   id:item.subject_id,name:item.subjects!.name,code:item.subjects!.code
  }));
  return NextResponse.json({className:cls.name+(cls.arm?" "+cls.arm:""),termId,
   students:students.data??[],subjects:orderedSubjects,marks:marks.data??[],
   corrections:corrections.data??[],signoff:signoff.data,batch:batch.data});
 }catch(e){return handleApiError(e);}
}

export async function POST(request:NextRequest,{params}:{params:Promise<{id:string}>}){
 try{
  const session=await requireRole(["TEACHER"]);
  const classId=uuidString.parse((await params).id);
  const action=classReviewActionSchema.parse(await request.json());
  const {db,termId}=await classScope(classId,session.authUserId,session.profile.school_id);
  let value:string|number|boolean|null=null;
  if(action.action==="REQUEST_CORRECTION"){
    const {data,error}=await db.rpc("hh_request_subject_correction",{
      p_class_id:classId,p_subject_id:action.subjectId,p_term_id:termId,p_reason:action.reason,
    });
    if(error){
      if(error.code==="PGRST202")throw new AppError("Apply SQL migration 0010 first.",503);
      if(["42501","22023","23505"].includes(error.code))throw new AppError(error.message,422);
      throw error;
    }
    value=data;
    // In-app notice is always attempted. Gmail email is sent only when
    // server SMTP credentials are configured. No student marks leave the portal.
    try{
      const privileged=createAdminClient();
      const {data:assigned}=await privileged.from("teacher_subject_assignments")
        .select("teacher_id,teachers(user_id,is_active)").eq("class_id",classId)
        .eq("subject_id",action.subjectId).limit(20);
      const recipientIds=Array.from(new Set((assigned??[])
        .filter(a=>a.teachers?.is_active).map(a=>a.teachers!.user_id)))
        .filter(id=>id!==session.authUserId);
      const title="Subject marks returned for correction";
      const message="Your submitted subject marks have been returned by the class teacher. Reason: "+action.reason+
        ". Open Subject Markbook, correct the marks and resubmit.";
      for(const recipientId of recipientIds){
        await sendNotification({schoolId:session.profile.school_id,recipientId,title,message,
          type:"OTHER",channel:"IN_APP"});
        if(gmailSmtpConfigured())await sendNotification({schoolId:session.profile.school_id,
          recipientId,title,message,type:"OTHER",channel:"EMAIL"});
      }
    }catch{console.error("Correction notifications could not all be delivered.");}
  } else if(action.action==="CLEAR_CORRECTION"){
    const {data,error}=await db.rpc("hh_clear_subject_correction",{p_request_id:action.requestId});
    if(error){
      if(error.code==="PGRST202")throw new AppError("Apply SQL migration 0010 first.",503);
      if(["42501","22023"].includes(error.code))throw new AppError(error.message,422);
      throw error;
    }
    value=data;
  } else {
    const {data,error}=await db.rpc("hh_signoff_class_review",{p_class_id:classId,p_term_id:termId});
    if(error){
      if(error.code==="PGRST202")throw new AppError("Apply SQL migration 0010 first.",503);
      if(["42501","22023"].includes(error.code))throw new AppError(error.message,422);
      throw error;
    }
    value=data;
  }
  return NextResponse.json({success:true,value});
 }catch(e){return handleApiError(e);}
}
