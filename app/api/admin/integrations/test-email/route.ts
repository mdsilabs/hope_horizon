import {NextResponse} from "next/server";
import {requireRole} from "@/lib/auth/requireSession";
import {createClient} from "@/lib/supabase/server";
import {testGmailSmtp,gmailSmtpConfigured} from "@/lib/email/gmail-smtp";
import {AppError,handleApiError} from "@/lib/utils/errors";

export const runtime="nodejs";
export async function POST(){
 try{
  const session=await requireRole(["ADMIN"]);
  if(!gmailSmtpConfigured())throw new AppError("Gmail SMTP credentials are missing on the server.",503);
  const db=await createClient();
  const cutoff=new Date(Date.now()-5*60*1000).toISOString();
  const {count,error}=await db.from("audit_logs").select("id",{count:"exact",head:true})
   .eq("school_id",session.profile.school_id).eq("user_id",session.authUserId)
   .eq("entity_type","gmail_smtp_test").gte("created_at",cutoff);
  if(error)throw error;
  if((count??0)>0)throw new AppError("Only one Gmail test per administrator every five minutes.",429);
  const {error:auditError}=await db.from("audit_logs").insert({
   school_id:session.profile.school_id,user_id:session.authUserId,
   action:"SYSTEM_SETTING_CHANGED",entity_type:"gmail_smtp_test",
   metadata:{operation:"delivery_test_requested"},
  });
  if(auditError)throw new AppError("Could not record email test request.",503);
  try{await testGmailSmtp(session.profile.email);}
  catch{
   throw new AppError("Gmail rejected the message or the connection failed. Verify your App Password, TLS port and Vercel outbound SMTP access.",502);
  }
  return NextResponse.json({message:"Gmail SMTP test accepted. Check your administrator inbox for delivery."});
 }catch(e){return handleApiError(e);}
}
