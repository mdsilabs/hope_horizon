import {NextResponse} from "next/server";
import {requireRole} from "@/lib/auth/requireSession";
import {createClient} from "@/lib/supabase/server";
import {handleApiError} from "@/lib/utils/errors";

export async function GET(){
 try{
  const session=await requireRole(["ADMIN","PRINCIPAL"]);
  const db=await createClient();
  const {data,error}=await db.from("class_result_batches")
   .select("id,class_id,term_id,status,release_state,head_signature_name,head_signed_at,published_at,withdrawn_at,classes(name,arm),terms(name)")
   .eq("school_id",session.profile.school_id).eq("status","APPROVED")
   .order("submitted_at",{ascending:false}).limit(100);
  if(error)throw error;
  return NextResponse.json({batches:data??[],canWithdraw:session.profile.role==="ADMIN"});
 }catch(e){return handleApiError(e);}
}
