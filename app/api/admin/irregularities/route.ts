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
    }))},{headers:{"Cache-Control":"no-store, private"}});
  }catch(error){return handleApiError(error);}
}