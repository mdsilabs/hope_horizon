import {NextResponse,type NextRequest} from "next/server";
import {requireRole} from "@/lib/auth/requireSession";
import {createClient} from "@/lib/supabase/server";
import {parentContactSchema} from "@/lib/validations/parent-contact";
import {AppError,handleApiError} from "@/lib/utils/errors";

export async function GET(){
  try{
    const session=await requireRole(["PARENT"]);
    const db=await createClient();
    const {data,error}=await db.from("parents")
      .select("id,full_name,email,phone,whatsapp_number,is_active")
      .eq("user_id",session.authUserId)
      .eq("school_id",session.profile.school_id).eq("is_active",true)
      .maybeSingle();
    if(error)throw new AppError("Unable to load your guardian account.",503);
    if(!data)throw new AppError("Ask your school to activate your parent profile.",403);
    return NextResponse.json({account:data,loginEmail:session.profile.email},
      {headers:{"Cache-Control":"no-store, private"}});
  }catch(error){return handleApiError(error);}
}
export async function PATCH(request:NextRequest){
  try{
    await requireRole(["PARENT"]);
    const input=parentContactSchema.parse(await request.json());
    const db=await createClient();
    const {data,error}=await db.rpc("hh_parent_update_contact",{
      p_phone:input.phone,p_whatsapp:input.whatsappNumber,
    });
    if(error){
      if(["PGRST202","42P01"].includes(error.code))
        throw new AppError("Ask your school to apply parent contact migration 0021.",503,"MIGRATION_REQUIRED");
      if(["22023","42501"].includes(error.code))
        throw new AppError(error.message,error.code==="42501"?403:422);
      throw new AppError("Could not save your phone numbers.",503);
    }
    if(data!==true)throw new AppError("Your guardian account could not be updated.",503);
    return NextResponse.json({message:"Your guardian contact numbers were saved to your parent account."},
      {headers:{"Cache-Control":"no-store, private"}});
  }catch(error){return handleApiError(error);}
}
