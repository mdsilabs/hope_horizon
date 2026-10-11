import {NextResponse,type NextRequest} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {createAdminClient} from "@/lib/supabase/admin";
import {setPasswordSchema} from "@/lib/validations/set-password";
import {AppError,AuthenticationError,handleApiError} from "@/lib/utils/errors";
import {z} from "zod";

const inputSchema=setPasswordSchema.extend({
  flow:z.enum(["TEMPORARY_PASSWORD","RECOVERY"]),
});

/**
 * Authenticated password setup. This endpoint is exempt from mandatory
 * password-change guards, but cannot grant any rights without a real
 * successful Supabase Auth password update.
 */
export async function POST(request:NextRequest){
 try{
  const input=inputSchema.parse(await request.json());
  const db=await createClient();
  const {data:{user},error:authError}=await db.auth.getUser();
  if(authError||!user)throw new AuthenticationError("Sign in or open a valid password recovery link first.");
  const admin=createAdminClient();
  const {data:profile,error:profileError}=await admin.from("users")
    .select("id,is_active,must_change_password,school_id").eq("id",user.id).maybeSingle();
  if(profileError||!profile||!profile.is_active)
    throw new AuthenticationError("This account is inactive or unavailable.");

  // Direct onboarding must confirm the original credential; recovery
  // users authenticate by using the Supabase Auth email recovery flow.
  if(input.flow==="TEMPORARY_PASSWORD"){
    if(!input.currentPassword)
      throw new AppError("Enter your temporary password to continue.",422);
    if(input.currentPassword===input.newPassword)
      throw new AppError("Choose a different password from the temporary one.",422);
  }

  const {error:updateError}=await db.auth.updateUser({
    password:input.newPassword,
    ...(input.currentPassword?{current_password:input.currentPassword}:{}),
  });
  if(updateError)
    throw new AppError("Password update was rejected. Verify the temporary password or recovery session and try again.",422);

  if(profile.must_change_password){
    const {error:metaError}=await admin.auth.admin.updateUserById(user.id,{
      app_metadata:{...user.app_metadata,must_change_password:false},
    });
    if(metaError)throw new AppError("Password changed, but account activation is incomplete. Try this step again.",503);
    const {error:flagError}=await admin.from("users").update({must_change_password:false})
      .eq("id",user.id).eq("school_id",profile.school_id);
    if(flagError)throw new AppError("Password changed, but account activation is incomplete. Try this step again.",503);
  }
  return NextResponse.json({message:"Password changed successfully. Please sign in again."},
    {headers:{"Cache-Control":"no-store, private"}});
 }catch(e){return handleApiError(e);}
}
