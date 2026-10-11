import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/requireSession";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { handleApiError } from "@/lib/utils/errors";
import { getPublicSupabaseConfig, SUPABASE_PROJECT_NAME, SUPABASE_PROJECT_REF } from "@/lib/supabase/config";

type Check = { name:string; status:"pass"|"warn"|"fail"; detail:string };
export async function GET() {
  try {
    const session=await requireRole(["ADMIN"]);
    const checks:Check[]=[];
    const add=(name:string,status:Check["status"],detail:string)=>checks.push({name,status,detail});
    let publicReady = false;
    try {
      getPublicSupabaseConfig();
      publicReady = true;
    } catch {
      publicReady = false;
    }
    add("Supabase project identity", publicReady ? "pass" : "fail",
      publicReady ? SUPABASE_PROJECT_NAME + " (" + SUPABASE_PROJECT_REF + ") is selected; public URL and publishable key are valid." :
        "Unexpected public environment override. Confirm the project URL and publishable key.");
    const hasAdmin=Boolean(process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY);
    add("Server administration key",hasAdmin?"pass":"fail",
      hasAdmin?"Server-only administration credential is present.":"Set SUPABASE_SECRET_KEY (preferred) or SUPABASE_SERVICE_ROLE_KEY server-side.");

    const db=await createClient();
    const {data:school,error:schoolError}=await db.from("schools").select("id")
      .eq("id",session.profile.school_id).maybeSingle();
    add("School database access",!schoolError&&!!school?"pass":"fail",
      !schoolError&&school?"Authenticated school record is reachable.":"School data is not available to this admin.");
    const tables=[
      ["Teachers","teachers","id"],["Classes","classes","id"],["Subjects","subjects","id"],
      ["Academic sessions","academic_sessions","id"],["Academic terms","terms","id"],
    ] as const;
    const results=await Promise.all(tables.map(async ([label,table,column])=>{
      const {error}=await db.from(table).select(column).eq("school_id",session.profile.school_id).limit(1);
      return {label,error};
    }));
    for(const result of results)add(result.label+" table",result.error?"fail":"pass",
      result.error?"Table cannot be queried. Check schema and RLS.":"School-scoped read succeeded.");

    const {data:capabilities,error:rpcError}=await db.rpc("hh_portal_capabilities");
    if(rpcError||!capabilities){
      add("Workflow migration 0005","fail","Read-only capability check unavailable. Apply migrations 0004 and 0005.");
    } else {
      const items=[
        ["Teacher assignment procedure",capabilities.teacher_assignment_rpc],
        ["Academic activation procedure",capabilities.academic_activation_rpc],
        ["Authentication sync trigger",capabilities.auth_trigger],
        ["Role protection trigger (0004)",capabilities.authorization_guard],
        ["Teacher RLS",capabilities.rls_teachers],
        ["Term RLS",capabilities.rls_terms],
      ] as const;
      for(const [label,ok] of items)add(label,ok?"pass":"fail",ok?"Database capability exists.":"Missing expected database safeguard.");
    }
    if(hasAdmin){
      try{
        const admin=createAdminClient();
        const {error}=await admin.auth.admin.listUsers({page:1,perPage:1});
        add("Supabase Auth administration",error?"fail":"pass",
          error?"Cannot authenticate service-role admin API.":"Auth admin API accepted the server credential.");
      }catch{
        add("Supabase Auth administration","fail","Unable to reach Auth admin API.");
      }
    }
    const appUrl=process.env.NEXT_PUBLIC_APP_URL;
    let validUrl=false;
    try{if(appUrl){const u=new URL(appUrl);validUrl=u.protocol==="https:"||(u.protocol==="http:"&&u.hostname==="localhost");}}catch{}
    add("Teacher onboarding callback",validUrl?"pass":"warn",
      validUrl?"Application URL is suitable for password-setup redirects. Ensure it is allowlisted in Supabase.":"Set NEXT_PUBLIC_APP_URL to the deployed HTTPS origin.");
    const smtpConfigured=["EMAIL_FROM","SMTP_HOST","SMTP_PORT","SMTP_USER","SMTP_PASSWORD"]
      .every(key=>Boolean(process.env[key]));
    add("Email provider configuration",smtpConfigured?"warn":"warn",
      smtpConfigured?"SMTP variables present; actual email delivery NOT tested.":"SMTP variables incomplete. Supabase Auth SMTP must be configured separately.");
    const whatsAppConfigured=["WHATSAPP_API_TOKEN","WHATSAPP_PHONE_NUMBER_ID"].every(key=>Boolean(process.env[key]));
    add("WhatsApp configuration","warn",whatsAppConfigured?
      "WhatsApp variables are present; provider delivery NOT tested.":"WhatsApp is not yet configured; provider delivery is not implemented.");
    return NextResponse.json({checkedAt:new Date().toISOString(),checks});
  }catch(e){return handleApiError(e);}
}
