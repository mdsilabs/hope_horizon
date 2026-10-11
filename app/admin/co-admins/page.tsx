"use client";
import {useCallback,useEffect,useState,type FormEvent} from "react";
import {ShieldCheck,Plus,RefreshCw,Mail,UserRound,LockKeyhole} from "lucide-react";
import {Card} from "@/components/ui/Card";
import {Button} from "@/components/ui/Button";
import {Input} from "@/components/ui/Input";

type Administrator={
  id:string;name:string;email:string;admin_tier:"PRIMARY"|"CO_ADMIN";
  is_active:boolean;last_login_at:string|null;created_at:string;
};
type Payload={administrators:Administrator[];currentUserId:string};
async function call<T>(url:string,options?:RequestInit):Promise<T>{
  const response=await fetch(url,{cache:"no-store",...options});
  const result=await response.json();
  if(!response.ok)throw new Error(typeof result.error==="string"?result.error:result.error?.message||"Request failed.");
  return result as T;
}
export default function CoAdminManagementPage(){
  const [admins,setAdmins]=useState<Administrator[]>([]);
  const [currentUserId,setCurrentUserId]=useState("");
  const [name,setName]=useState(""),[email,setEmail]=useState("");
  const [loading,setLoading]=useState(true),[busyId,setBusyId]=useState(""),[creating,setCreating]=useState(false);
  const [error,setError]=useState(""),[notice,setNotice]=useState("");

  const load=useCallback(async()=>{
    setLoading(true);
    try{
      const data=await call<Payload>("/api/admin/co-admins");
      setAdmins(data.administrators);setCurrentUserId(data.currentUserId);setError("");
    }catch(e){setError(e instanceof Error?e.message:"Unable to load administrators.");}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{void load();},[load]);

  async function create(e:FormEvent<HTMLFormElement>){
    e.preventDefault();
    setCreating(true);setNotice("");setError("");
    try{
      const result=await call<{message:string}>("/api/admin/co-admins",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({fullName:name,email}),
      });
      setName("");setEmail("");setNotice(result.message);await load();
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
  const primaries=admins.filter(x=>x.admin_tier==="PRIMARY");
  const collaborators=admins.filter(x=>x.admin_tier==="CO_ADMIN");
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
      <form onSubmit={create} className="mt-4 flex flex-wrap items-end gap-3">
        <div className="min-w-52 flex-1">
          <Input id="coadmin-name" required label="Full name" maxLength={120}
            value={name} onChange={e=>setName(e.target.value)} placeholder="Staff member's name"/>
        </div>
        <div className="min-w-52 flex-1">
          <Input id="coadmin-email" required type="email" label="Email address"
            value={email} onChange={e=>setEmail(e.target.value)} placeholder="colleague@example.com"/>
        </div>
        <Button type="submit" disabled={creating||!!busyId} isLoading={creating}>
          <Plus className="h-4 w-4"/>Create Co-Admin
        </Button>
      </form>
      <p className="mt-3 text-xs text-slate-500">A unique undisclosed password is created and a password-setup email is requested. Supabase Auth SMTP must be configured for delivery.</p>
    </Card>
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
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" disabled={!!busyId||creating||!a.is_active}
                onClick={()=>void resend(a)}><Mail className="h-4 w-4"/>Setup email</Button>
              <Button size="sm" variant="secondary" disabled={!!busyId||creating||a.id===currentUserId}
                onClick={()=>void change(a)}>{a.is_active?"Deactivate":"Reactivate"}</Button>
            </div>
          </div>)}
        </div>}
    </Card>
  </div>;
}
