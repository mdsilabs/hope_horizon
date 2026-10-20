import "server-only";
import {redirect} from "next/navigation";
import {getCurrentSession} from "@/lib/auth/getCurrentSession";
import {createClient} from "@/lib/supabase/server";

export type LinkedChild={
  id:string;full_name:string;admission_number:string;class_id:string;is_active:boolean;
  passport_url:string|null;
  classes:{name:string;arm:string|null;level:string}|null;
};
export type ParentFamily={
  userId:string;schoolId:string;parentName:string;parentId:string|null;children:LinkedChild[];
};

export async function loadParentFamily():Promise<ParentFamily>{
  const session=await getCurrentSession();
  if(!session)redirect("/login");
  if(session.profile.role!=="PARENT")redirect("/");
  const db=await createClient();
  const {data:parent,error:parentError}=await db.from("parents")
    .select("id,full_name,is_active").eq("user_id",session.authUserId)
    .eq("school_id",session.profile.school_id).maybeSingle();
  if(parentError)throw new Error("Could not load your parent profile.");
  if(!parent||!parent.is_active)
    return {userId:session.authUserId,schoolId:session.profile.school_id,
      parentName:session.profile.name,parentId:null,children:[]};

  // All child links must be established by school administrators. RLS limits
  // the junction rows to this parent and students to linked children only.
  const {data:links,error}=await db.from("parent_students")
    .select("student_id,students(id,full_name,admission_number,class_id,is_active,passport_url,classes(name,arm,level))")
    .eq("parent_id",parent.id);
  if(error)throw new Error("Could not load your linked children's records.");
  const children=(links??[]).flatMap(link=>{
    const s=link.students as unknown as LinkedChild|null;
    return s&&s.is_active?[s]:[];
  }).sort((a,b)=>a.full_name.localeCompare(b.full_name));
  return {userId:session.authUserId,schoolId:session.profile.school_id,
    parentName:parent.full_name,parentId:parent.id,children};
}
