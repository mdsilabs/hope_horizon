"use client";
import {useCallback,useEffect,useState,type FormEvent} from "react";
import {ShieldCheck,Plus,RefreshCw,Mail,UserRound,LockKeyhole,Copy,Check} from "lucide-react";
import {Card} from "@/components/ui/Card";
import {Button} from "@/components/ui/Button";
import {Input} from "@/components/ui/Input";

type Administrator={
  id:string;name:string;email:string;admin_tier:"PRIMARY"|"CO_ADMIN";
  is_active:boolean;must_change_password:boolean;last_login_at:string|null;created_at:string;
};
type Payload={administrators:Administrator[];currentUserId:string;creationReadiness?:{ready:boolean;message:string|null}};
async function call<T>(url:string,options?:RequestInit):Promise<T>{
  const response=await fetch(url,{cache:"no-store",...options});
  const result=await response.json();
  if(!response.ok)throw new Error(typeof result.error==="string"?result.error:result.error?.message||"Request failed.");
  return result as T;
}
export default function CoAdminManagementPage(){
  const [admins,setAdmins]=useState<Administrator[]>([]);
  const [currentUserId,setCurrentUserId]=useState("");
  const [creationReadiness,setCreationReadiness]=useState<{ready:boolean;message:string|null}|null>(null);
  const [name,setName]=useState(""),[email,setEmail]=useState("");
  const [setupMethod,setSetupMethod]=useState<"TEMPORARY_PASSWORD"|"EMAIL_LINK">("TEMPORARY_PASSWORD");
  const [credential,setCredential]=useState<{email:string;password:string}|null>(null);
  const [copied,setCopied]=useState(false);
  const [loading,setLoading]=useState(true),[busyId,setBusyId]=useState(""),[creating,setCreating]=useState(false);
  const [error,setError]=useState(""),[notice,setNotice]=useState("");

  const load=useCallback(async()=>{
    setLoading(true);
    try{
      const data=await call<Payload>("/api/admin/co-admins");
      setAdmins(data.administrators);setCurrentUserId(data.currentUserId);
      setCreationReadiness(data.creationReadiness??null);setError("");
    }catch(e){setError(e instanceof Error?e.message:"Unable to load administrators.");}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{void load();},[load]);

  async function create(e:FormEvent<HTMLFormElement>){
    e.preventDefault();
    if(credential&&!window.confirm("Creating another account will clear the displayed temporary password. Have you saved it securely?"))return;
    setCreating(true);setNotice("");setError("");setCredential(null);setCopied(false);
    try{
      const result=await call<{message:string;temporaryPassword?:string;email:string}>("/api/admin/co-admins",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({fullName:name,email,setupMethod}),
      });
      setName("");setEmail("");setNotice(result.message);
      if(result.temporaryPassword)setCredential({email:result.email,password:result.temporaryPassword});
      await load();
    }catch(e){setError(e instanceof Error?e.message:"Could not add Co-Admin.");}
    finally{setCreating(false);}
  }
  async function change(admin:Administrator){
    if(admin.admin_tier!=="CO_ADMIN" || admin.id===currentUserId)return;
    const action=admin.is_active?"deactivate":"reactivate";
    if(!window.confirm(`Do you want to ${action} ${admin.name}?`))return;
    setBusyId(admin.id);setNotice("");setError("");
    try{
      const response=await call<{message:string}>("/api/admin/co-admins/"+admin.id,{
        method:"PATCH",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({isActive:!admin.is_active}),
      });
      setNotice(response.message);await load();
    }catch(e){setError(e instanceof Error?e.message:"Could not change Co-Admin status.");}
    finally{setBusyId("");}
  }
  async function resend(admin:Administrator){
    setBusyId(admin.id);setNotice("");setError("");
    try{
      const result=await call<{message:string}>("/api/admin/co-admins/"+admin.id+"/send-setup",{method:"POST"});
      setNotice(result.message);
    }catch(e){setError(e instanceof Error?e.message:"Could not send setup email.");}
    finally{setBusyId("");}
  }
  async function issuePassword(admin:Administrator){
    if(admin.admin_tier!=="CO_ADMIN"||!admin.must_change_password||!admin.is_active)return;
    if(credential&&!window.confirm("The currently displayed temporary credential will be lost. Have you copied it securely?"))return;
    if(!window.confirm("Replace the pending Co-Admin setup credential with a new temporary password? The old credential will stop working."))return;
    setBusyId(admin.id);setNotice("");setError("");
    try{
      const result=await call<{email:string;temporaryPassword:string;message:string}>(
        "/api/admin/co-admins/"+admin.id+"/issue-temporary-password",{
          method:"POST",headers:{"Content-Type":"application/json"},
          body:JSON.stringify({confirm:"ISSUE_TEMPORARY_PASSWORD"}),
        }
      );
      setCredential({email:result.email,password:result.temporaryPassword});
      setCopied(false);setNotice(result.message);
      await load();
    }catch(e){setError(e instanceof Error?e.message:"Unable to issue a temporary password.");}
    finally{setBusyId("");}
  }
  const primaries=admins.filter(x=>x.admin_tier==="PRIMARY");
  const collaborators=admins.filter(x=>x.admin_tier==="CO_ADMIN");
  const primarySignedIn=primaries.some(x=>x.id===currentUserId);
  return <div className="mx-auto max-w-5xl space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-sm font-semibold text-brand-700">Team access</p>
        <h1 className="mt-1 font-display text-2xl font-semibold text-slate-900">Administrators and Co-Admins</h1>
        <p className="mt-1 text-sm text-slate-600">Give trusted colleagues administrator permissions without risking the original administrator account.</p>
      </div>
      <Button variant="secondary" size="sm" disabled={loading||creating||!!busyId} onClick={()=>void load()}>
        <RefreshCw className="h-4 w-4"/>Refresh
      </Button>
    </div>
    {error&&<p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {notice&&<p role="status" className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-700">{notice}</p>}
    <Card>
      <h2 className="flex items-center gap-2 font-semibold text-slate-900"><Plus className="h-5 w-5"/>Add Co-Admin</h2>
      <p className="mt-1 text-sm text-slate-600">
        Co-Admins can manage the same school operations as an Administrator. They cannot deactivate,
        demote, change the school of, or delete a primary Administrator.
      </p>
      {creationReadiness && !creationReadiness.ready &&
        <p role="alert" className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Co-Admin creation is unavailable: {creationReadiness.message}
          {" "}Open <a href="/admin/integrations" className="font-semibold underline">Integration health</a> to review your configuration.
        </p>}
      <form onSubmit={create} className="mt-4 flex flex-wrap items-end gap-3">
        <div className="min-w-52 flex-1">
          <Input id="coadmin-name" required label="Full name" maxLength={120}
            value={name} onChange={e=>setName(e.target.value)} placeholder="Staff member's name"/>
        </div>
        <div className="min-w-52 flex-1">
          <Input id="coadmin-email" required type="email" label="Email address"
            value={email} onChange={e=>setEmail(e.target.value)} placeholder="colleague@example.com"/>
        </div>
        <fieldset className="w-full rounded-xl border border-slate-200 p-4">
          <legend className="px-1 text-sm font-semibold text-slate-800">Choose how the Co-Admin signs in</legend>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <label className={"flex cursor-pointer items-start gap-3 rounded-xl border p-3 "+
              (setupMethod==="TEMPORARY_PASSWORD"?"border-brand-500 bg-brand-50":"border-slate-200")}>
              <input type="radio" name="setup-method" className="mt-1 accent-blue-600"
                checked={setupMethod==="TEMPORARY_PASSWORD"}
                onChange={()=>setSetupMethod("TEMPORARY_PASSWORD")}/>
              <span><span className="block font-semibold text-sm">Create with temporary password</span>
                <span className="mt-1 block text-xs text-slate-600">No email sent. Show a secure password once for you to pass privately to the Co-Admin.</span></span>
            </label>
            <label className={"flex cursor-pointer items-start gap-3 rounded-xl border p-3 "+
              (setupMethod==="EMAIL_LINK"?"border-brand-500 bg-brand-50":"border-slate-200")}>
              <input type="radio" name="setup-method" className="mt-1 accent-blue-600"
                checked={setupMethod==="EMAIL_LINK"} onChange={()=>setSetupMethod("EMAIL_LINK")}/>
              <span><span className="block font-semibold text-sm">Send email setup link</span>
                <span className="mt-1 block text-xs text-slate-600">Requires Gmail SMTP configured in Supabase Authentication.</span></span>
            </label>
          </div>
        </fieldset>
        <Button type="submit" disabled={creating||!!busyId||loading||creationReadiness?.ready===false} isLoading={creating}>
          <Plus className="h-4 w-4"/>{setupMethod==="TEMPORARY_PASSWORD"?"Create without email":"Create and email link"}
        </Button>
      </form>
      <p className="mt-3 text-xs text-slate-500">Both methods require the new Co-Admin to set their own password.
        Use a private channel to share any temporary credential. Never share it in a public group.</p>
    </Card>
    {credential&&<Card>
      <div className="flex items-start gap-3">
        <LockKeyhole className="mt-1 h-6 w-6 shrink-0 text-brand-700"/>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-slate-900">Temporary Co-Admin credentials · Displayed once</h2>
          <p className="mt-1 text-sm text-slate-600">No email was sent. Copy the password before closing this section.
            It will never appear in the account list and cannot be retrieved after leaving this page.</p>
          <p className="mt-3 text-sm font-medium">Email: {credential.email}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="max-w-full break-all rounded-lg bg-slate-100 p-3 text-sm font-semibold">{credential.password}</code>
            <Button size="sm" variant="secondary" onClick={()=>void navigator.clipboard.writeText(credential.password)
              .then(()=>setCopied(true)).catch(()=>setError("Copy failed. Select and copy the password manually."))}>
              {copied?<Check className="h-4 w-4"/>:<Copy className="h-4 w-4"/>}
              {copied?"Copied":"Copy password"}
            </Button>
          </div>
          <p className="mt-2 text-xs text-amber-800">The Co-Admin must sign in at /login and change this password before accessing school data.</p>
          <Button size="sm" variant="secondary" onClick={()=>{setCredential(null);setCopied(false);}}>
            Close and clear credentials
          </Button>
        </div>
      </div>
    </Card>}
    <Card>
      <h2 className="flex items-center gap-2 font-semibold text-slate-900"><ShieldCheck className="h-5 w-5 text-green-700"/>Protected primary administrators</h2>
      <p className="mb-4 mt-1 text-sm text-slate-600">These accounts are protected by database rules and cannot be deactivated or removed through Co-Admin management.</p>
      {loading?<p className="text-sm text-slate-500">Loading administrators...</p>:
        primaries.length===0?<p className="text-sm text-amber-700">No protected primary admin detected. Check migration 0008.</p>:
        <div className="divide-y divide-slate-100">
          {primaries.map(a=><div key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="rounded-full bg-green-50 p-2 text-green-700"><LockKeyhole className="h-4 w-4"/></span>
              <div><p className="font-medium text-slate-900">{a.name}{a.id===currentUserId?" (you)":""}</p>
                <p className="break-all text-xs text-slate-500">{a.email}</p></div>
            </div>
            <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-semibold text-green-700">Primary · Protected</span>
          </div>)}
        </div>}
    </Card>
    <Card>
      <h2 className="flex items-center gap-2 font-semibold text-slate-900"><UserRound className="h-5 w-5"/>Co-Admins ({collaborators.length})</h2>
      {loading?<p className="mt-3 text-sm text-slate-500">Loading Co-Admins...</p>:
        collaborators.length===0?<p className="mt-3 text-sm text-slate-500">No Co-Admins yet. Add your first colleague above.</p>:
        <div className="mt-3 divide-y divide-slate-100">
          {collaborators.map(a=><div key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div className="min-w-0">
              <p className="font-semibold text-slate-900">{a.name}{a.id===currentUserId?" (you)":""}</p>
              <p className="break-all text-sm text-slate-600">{a.email}</p>
              <span className={"mt-1 inline-block text-xs font-medium "+(a.is_active?"text-green-700":"text-red-700")}>
                {a.is_active?"Active":"Inactive"}
              </span>
              {a.must_change_password&&<span className="ml-3 text-xs text-amber-800">Password setup pending</span>}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" disabled={!!busyId||creating||!a.is_active}
                onClick={()=>void resend(a)}><Mail className="h-4 w-4"/>Setup email</Button>
              {primarySignedIn&&a.must_change_password&&a.is_active&&
                <Button size="sm" variant="secondary" disabled={!!busyId||creating}
                  onClick={()=>void issuePassword(a)}>
                  <LockKeyhole className="h-4 w-4"/>Issue temporary password
                </Button>}
              <Button size="sm" variant="secondary" disabled={!!busyId||creating||a.id===currentUserId}
                onClick={()=>void change(a)}>{a.is_active?"Deactivate":"Reactivate"}</Button>
            </div>
          </div>)}
        </div>}
    </Card>
  </div>;
}
