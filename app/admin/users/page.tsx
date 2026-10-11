"use client";

import { useCallback,useEffect,useState,type FormEvent } from "react";
import Link from "next/link";
import { Search, Users, Save, RefreshCw, ShieldCheck, UserCircle2 } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

type User={id:string;name:string;email:string;role:string;admin_tier:"PRIMARY"|"CO_ADMIN"|null;phone:string|null;whatsapp_number:string|null;
  avatar_url:string|null;is_active:boolean;last_login_at:string|null};
function errorMessage(body:unknown):string{
  return (body as {error?:{message?:string}})?.error?.message||"The request could not be completed.";
}
export default function ManageUsersPage(){
  const [users,setUsers]=useState<User[]>([]);
  const [q,setQ]=useState(""),[search,setSearch]=useState(""),[page,setPage]=useState(1);
  const [total,setTotal]=useState(0);
  const [selected,setSelected]=useState<string|null>(null);
  const [name,setName]=useState(""),[phone,setPhone]=useState(""),[whatsapp,setWhatsapp]=useState("");
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
  const [error,setError]=useState(""),[notice,setNotice]=useState("");
  const load=useCallback(async()=>{
    setLoading(true);
    try{
      const query=new URLSearchParams({page:String(page)});
      if(search)query.set("q",search);
      const response=await fetch("/api/admin/users?"+query,{cache:"no-store"});
      const body=await response.json();
      if(!response.ok)throw new Error(errorMessage(body));
      setUsers(body.users);setTotal(body.total);setError("");
    }catch(e){setError(e instanceof Error?e.message:"Unable to load users.");}
    finally{setLoading(false);}
  },[page,search]);
  useEffect(()=>{void load();},[load]);

  const current=users.find(u=>u.id===selected);
  function choose(u:User){
    setSelected(u.id);setName(u.name);setPhone(u.phone||"");setWhatsapp(u.whatsapp_number||"");
    setError("");setNotice("");
  }
  async function save(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(!selected)return;
    setBusy(true);setError("");setNotice("");
    try{
      const response=await fetch("/api/admin/users/"+selected,{
        method:"PATCH",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({name,phone,whatsappNumber:whatsapp}),
      });
      const body=await response.json();
      if(!response.ok)throw new Error(errorMessage(body));
      setUsers(list=>list.map(u=>u.id===selected?{...u,...body.user}:u));
      setNotice("User contact profile saved.");
    }catch(e){setError(e instanceof Error?e.message:"Unable to save user profile.");}
    finally{setBusy(false);}
  }
  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h1 className="font-display text-2xl font-semibold text-slate-900">User profiles</h1>
        <p className="mt-1 text-sm text-slate-500">Find accounts and update their contact details without changing access roles.</p></div>
      <Button size="sm" variant="secondary" disabled={busy||loading} onClick={()=>void load()}>
        <RefreshCw className="h-4 w-4"/>Refresh</Button>
    </div>
    {error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {notice&&<p role="status" className="rounded-xl bg-green-50 p-3 text-sm text-green-800">{notice}</p>}
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
      <Card>
        <h2 className="mb-4 flex items-center gap-2 font-semibold"><Users className="h-5 w-5"/>School users</h2>
        <form className="mb-4 flex items-end gap-2" onSubmit={e=>{e.preventDefault();setPage(1);setSearch(q.trim());}}>
          <div className="min-w-0 flex-1">
            <Input id="user-search" label="Search name or email" value={q} maxLength={80}
              onChange={e=>setQ(e.target.value)}/>
          </div>
          <Button type="submit" variant="secondary"><Search className="h-4 w-4"/>Search</Button>
        </form>
        {loading?<p className="py-5 text-sm text-slate-500">Loading users...</p>:
        users.length===0?<p className="py-5 text-sm text-slate-500">No matching users.</p>:
        <div className="max-h-[600px] divide-y divide-slate-100 overflow-y-auto">
          {users.map(u=><button key={u.id} type="button" onClick={()=>choose(u)}
            className={"flex w-full items-center gap-3 rounded-lg p-3 text-left "+
              (selected===u.id?"bg-brand-50":"hover:bg-slate-50")}>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100">
              {u.avatar_url?<img src={u.avatar_url} alt="" className="h-full w-full object-cover"/>:
                <UserCircle2 className="h-6 w-6 text-slate-500"/>}
            </div>
            <div className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-slate-800">{u.name}</span>
              <span className="block truncate text-xs text-slate-500">{u.email}</span>
              <span className="block text-xs text-brand-700">{u.role==="ADMIN"?(u.admin_tier==="PRIMARY"?"Primary Admin":"Co-Admin"):u.role.replaceAll("_"," ")} · {u.is_active?"Active":"Inactive"}</span>
            </div>
          </button>)}
        </div>}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
          <span>{total} accounts · Page {page} of {Math.max(1,Math.ceil(total/25))}</span>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" disabled={loading||page===1}
              onClick={()=>setPage(x=>x-1)}>Previous</Button>
            <Button size="sm" variant="secondary" disabled={loading||page*25>=total}
              onClick={()=>setPage(x=>x+1)}>Next</Button>
          </div>
        </div>
      </Card>
      <Card>
        {current?<div>
          <h2 className="font-semibold text-slate-900">Edit user profile</h2>
          <p className="mt-1 text-sm text-slate-500">{current.email}</p>
          <p className="mb-4 text-xs font-medium text-brand-700">{current.role==="ADMIN"?(current.admin_tier==="PRIMARY"?"Primary Admin":"Co-Admin"):current.role.replaceAll("_"," ")}</p>
          <form onSubmit={save} className="space-y-4">
            <Input id="edit-user-name" label="Full name" required value={name}
              onChange={e=>setName(e.target.value)} maxLength={120}/>
            <Input id="edit-user-phone" label="Phone" value={phone}
              onChange={e=>setPhone(e.target.value)} maxLength={32}/>
            <Input id="edit-user-whatsapp" label="WhatsApp" value={whatsapp}
              onChange={e=>setWhatsapp(e.target.value)} maxLength={32}/>
            <Button isLoading={busy} type="submit"><Save className="h-4 w-4"/>Save profile</Button>
          </form>
          <div className="mt-5 flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
            <ShieldCheck className="h-4 w-4 shrink-0 text-brand-700"/>
            <p>Login email, role, school and account status are protected from editing here.</p>
          </div>
        </div>:<div className="space-y-3 text-center">
          <UserCircle2 className="mx-auto h-10 w-10 text-slate-400"/>
          <p className="text-sm text-slate-500">Select a user to edit contact details.</p>
          <Link href="/profile" className="text-sm font-medium text-brand-700 underline">Edit my own profile</Link>
        </div>}
      </Card>
    </div>
  </div>;
}
