import {NextResponse,type NextRequest} from "next/server";
import {requireRole} from "@/lib/auth/requireSession";
import {createClient} from "@/lib/supabase/server";
import {submitIrregularitySchema} from "@/lib/validations/irregularities";
import {AppError,handleApiError} from "@/lib/utils/errors";

export async function GET(){
  try{
    const session=await requireRole(["TEACHER"]);
    const db=await createClient(),schoolId=session.profile.school_id;
    const {data:teacher,error:teacherError}=await db.from("teachers")
      .select("id").eq("school_id",schoolId).eq("user_id",session.authUserId)
      .eq("is_active",true).maybeSingle();
    if(teacherError)throw teacherError;
    if(!teacher)throw new AppError("Ask your school administrator to activate your teacher profile.",403);
    const [ownClassResult,subjectResult,termsResult,requestResult]=await Promise.all([
      db.from("teacher_classes").select("class_id").eq("teacher_id",teacher.id),
      db.from("teacher_subject_assignments")
        .select("class_id,subject_id,subjects(name,code)").eq("teacher_id",teacher.id),
      db.from("terms").select("id,name,academic_sessions(name)")
        .eq("school_id",schoolId).order("created_at",{ascending:false}).limit(50),
      db.from("hh_irregularity_requests").select("*")
        .eq("school_id",schoolId).order("created_at",{ascending:false}).limit(150),
    ]);
    if(ownClassResult.error||subjectResult.error||termsResult.error||requestResult.error)
      throw new AppError("Could not load class irregularities. Confirm migration 0015 is installed.",503,"MIGRATION_REQUIRED");

    const ownClassIds=(ownClassResult.data??[]).map(x=>x.class_id);
    const subjectLinks=subjectResult.data??[];
    // Class teachers can report irregularities for all subjects in their
    // assigned class, even subjects taught by someone else. The database
    // function independently verifies their class-teacher role.
    const {data:allClassSubjects,error:classSubjectError}=ownClassIds.length
      ?await db.from("class_subjects")
        .select("class_id,subject_id,subjects(id,name,code,is_active,school_id)")
        .in("class_id",ownClassIds)
      :{data:[],error:null};
    if(classSubjectError)throw new AppError("Could not load subjects assigned to your classes.",503);
    const classIds=Array.from(new Set([...ownClassIds,...subjectLinks.map(x=>x.class_id)]));
    const [classesResult,staffResult,studentsResult,schoolResult]=await Promise.all([
      classIds.length?db.from("classes").select("id,name,arm,is_active")
        .eq("school_id",schoolId).in("id",classIds).eq("is_active",true):Promise.resolve({data:[],error:null}),
      classIds.length?db.from("teacher_classes").select("class_id,teachers(user_id,is_active)")
        .in("class_id",classIds):Promise.resolve({data:[],error:null}),
      classIds.length?db.from("students")
        .select("id,class_id,full_name,admission_number").eq("school_id",schoolId)
        .eq("is_active",true).in("class_id",classIds).order("full_name").limit(3000):Promise.resolve({data:[],error:null}),
      db.from("schools").select("current_term_id").eq("id",schoolId).single(),
    ]);
    if(classesResult.error||staffResult.error||studentsResult.error||schoolResult.error)
      throw new AppError("Cannot load assigned class directory.",503);
    const staffLinks=(staffResult.data??[]).filter(x=>x.teachers?.is_active);
    const teacherIds=Array.from(new Set(staffLinks.map(x=>x.teachers!.user_id)));
    const requests=requestResult.data??[];
    const profileIds=Array.from(new Set([...teacherIds,...requests.flatMap(r=>
      [r.class_teacher_id,r.requester_id,r.class_reviewed_by,r.admin_decided_by].filter((v):v is string=>!!v))]));
    const {data:profiles,error:profileError}=profileIds.length
      ?await db.from("users").select("id,name").eq("school_id",schoolId).in("id",profileIds)
      :{data:[],error:null};
    if(profileError)throw profileError;
    const names=Object.fromEntries((profiles??[]).map(u=>[u.id,u.name]));
    const classTeachers=(classesResult.data??[]).map(c=>{
      const members=staffLinks.filter(x=>x.class_id===c.id);
      const userIds=Array.from(new Set(members.map(x=>x.teachers!.user_id)));
      return {
        id:c.id,name:c.name+(c.arm?" "+c.arm:""),
        classTeacherName:userIds.length===1 ? names[userIds[0]]??"Not available" :
          userIds.length===0 ? "Not assigned" : "Multiple teachers assigned",
        classTeacherId:userIds.length===1?userIds[0]:null,
        classTeacherReady:userIds.length===1,
        isClassTeacher:ownClassIds.includes(c.id),
      };
    });
    const requestIds=requests.map(r=>r.id);
    const {data:events,error:historyError}=requestIds.length
      ?await db.from("hh_irregularity_events")
        .select("id,request_id,event_type,note,created_at,actor_id")
        .in("request_id",requestIds).order("id",{ascending:true}).limit(800)
      :{data:[],error:null};
    if(historyError)throw historyError;
    return NextResponse.json({
      currentUserId:session.authUserId,currentTermId:schoolResult.data?.current_term_id??null,
      classes:classTeachers,terms:(termsResult.data??[]).map(t=>({
        id:t.id,name:t.name,sessionName:t.academic_sessions?.name??"",
      })),students:studentsResult.data??[],
      subjects:Array.from(new Map([
        ...subjectLinks.filter(s=>s.subjects)
          .map(s=>({classId:s.class_id,subjectId:s.subject_id,
            name:s.subjects!.name,code:s.subjects!.code})),
        ...(allClassSubjects??[])
          .filter(s=>s.subjects?.is_active&&s.subjects?.school_id===schoolId)
          .map(s=>({classId:s.class_id,subjectId:s.subject_id,
            name:s.subjects!.name,code:s.subjects!.code})),
      ].map(s=>[s.classId+":"+s.subjectId,s] as const)).values()),
      requests:requests.map(r=>({
        ...r,classTeacherName:names[r.class_teacher_id]??"Class teacher",
        requesterName:names[r.requester_id]??"Teacher",
      })),
      events:events??[],
    },{headers:{"Cache-Control":"no-store, private"}});
  }catch(error){return handleApiError(error);}
}

export async function POST(request:NextRequest){
  try{
    await requireRole(["TEACHER"]);
    const input=submitIrregularitySchema.parse(await request.json());
    const db=await createClient();
    const {data,error}=await db.rpc("hh_submit_irregularity",{
      p_kind:input.kind,p_class_id:input.classId,p_term_id:input.termId,
      p_subject_id:input.kind==="EDIT_MARK"?input.subjectId:null,
      p_student_id:input.kind==="EDIT_MARK"?input.studentId:null,
      p_payload:input.kind==="ADD_STUDENT" ?
        {fullName:input.fullName,admissionNumber:input.admissionNumber} :
        {ca:input.ca,exam:input.exam},
      p_reason:input.reason,
    });
    if(error){
      if(error.code==="PGRST202")throw new AppError("Install migration 0015 for class irregularity requests.",503,"MIGRATION_REQUIRED");
      if(["42501","22023","23505"].includes(error.code))
        throw new AppError(error.message,error.code==="42501"?403:422);
      throw error;
    }
    return NextResponse.json({id:data,message:"Request submitted for review. No marks or student records have been changed."},
      {status:201,headers:{"Cache-Control":"no-store, private"}});
  }catch(error){return handleApiError(error);}
}
