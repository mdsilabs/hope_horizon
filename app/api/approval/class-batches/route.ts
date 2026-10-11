import {NextResponse} from "next/server";
import {requireRole} from "@/lib/auth/requireSession";
import {createClient} from "@/lib/supabase/server";
import {handleApiError} from "@/lib/utils/errors";

export async function GET(){
  try{
    const session=await requireRole(["PRINCIPAL","ADMIN"]);
    const db=await createClient();
    const {data,error}=await db.from("class_result_batches")
      .select("id,class_id,term_id,status,submitted_at,decision_remarks,classes(name,arm),terms(name)")
      .eq("school_id",session.profile.school_id)
      .order("submitted_at",{ascending:false}).limit(200);
    if(error)throw error;
    return NextResponse.json({batches:data??[]});
  }catch(e){return handleApiError(e);}
}
