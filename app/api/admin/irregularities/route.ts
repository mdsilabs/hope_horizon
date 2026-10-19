import {NextResponse} from "next/server";
import {requireRole} from "@/lib/auth/requireSession";
import {createClient} from "@/lib/supabase/server";
import {AppError,handleApiError} from "@/lib/utils/errors";

export async function GET(){
  try{
    const session=await requireRole(["ADMIN"]);
    const db=await createClient(),schoolId=session.profile.school_id;
    const {data,error}=await db.from("hh_irregularity_requests")
      .select("*").eq("school_id",schoolId)
      .order("created_at",{ascending:false}).limit(250);
    if(error)throw new AppError("Cannot load irregularity requests. Apply migration 0015.",503,"MIGRATION_REQUIRED");
    const requests=data??[];
    const ids=Array.from(new Set(requests.flatMap(r=>[r.requester_id,r.class_teacher_id])));
    const classIds=Array.from(new Set(requests.map(r=>r.class_id)));
    const studentIds=Array.from(new Set(requests.flatMap(r=>r.student_id?[r.student_id]:[])));
    const subjectIds=Array.from(new Set(requests.flatMap(r=>r.subject_id?[r.subject_id]:[])));
    const termIds=Array.from(new Set(requests.map(r=>r.term_id)));
    const [studentResult,subjectResult,termResult]=await Promise.all([
      studentIds.length?db.from("students").select("id,full_name,admission_number")
        .eq("school_id",schoolId).in("id",studentIds):Promise.resolve({data:[],error:null}),
      subjectIds.length?db.from("subjects").select("id,name,code")
        .eq("school_id",schoolId).in("id",subjectIds):Promise.resolve({data:[],error:null}),
      termIds.length?db.from("terms").select("id,name")
        .eq("school_id",schoolId).in("id",termIds):Promise.resolve({data:[],error:null}),
    ]);
    if(studentResult.error||subjectResult.error||termResult.error)
      throw new AppError("Could not resolve request student, subject or term.",503);
    const studentNames=Object.fromEntries((studentResult.data??[]).map(x=>[x.id,x.full_name+" ("+x.admission_number+")"]));
    const subjectNames=Object.fromEntries((subjectResult.data??[]).map(x=>[x.id,x.name+" ("+x.code+")"]));
    const termNames=Object.fromEntries((termResult.data??[]).map(x=>[x.id,x.name]));
    const [userResult,classResult]=await Promise.all([
      ids.length?db.from("users").select("id,name").eq("school_id",schoolId).in("id",ids):
        Promise.resolve({data:[],error:null}),
      classIds.length?db.from("classes").select("id,name,arm").eq("school_id",schoolId).in("id",classIds):
        Promise.resolve({data:[],error:null}),
    ]);
    if(userResult.error||classResult.error)throw new AppError("Could not resolve school staff and classes.",503);
    const names=Object.fromEntries((userResult.data??[]).map(u=>[u.id,u.name]));
    const classes=Object.fromEntries((classResult.data??[]).map(c=>[c.id,c.name+(c.arm?" "+c.arm:"")]));
    return NextResponse.json({requests:requests.map(r=>({
      ...r,className:classes[r.class_id]??"Class",
      classTeacherName:names[r.class_teacher_id]??"Class teacher",
      requesterName:names[r.requester_id]??"Teacher",
      studentName:r.student_id?studentNames[r.student_id]??"Student":"", 
      subjectName:r.subject_id?subjectNames[r.subject_id]??"Subject":"",
      termName:termNames[r.term_id]??"Term",
    }))},{headers:{"Cache-Control":"no-store, private"}});
  }catch(error){return handleApiError(error);}
}