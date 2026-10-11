"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Plus, RefreshCw, Search, UserRound, Mail, Save, X, Link2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";

type Child={id:string;full_name:string;admission_number:string;class_id?:string;is_active?:boolean};
type Parent={
  id:string;full_name:string;phone:string|null;email:string|null;user_id:string;is_active:boolean;
  users:{email:string;is_active:boolean}|null;
  parent_students:{student_id:string;students:{id:string;full_name:string;admission_number:string;is_active:boolean}|null}[];
};
type Selection={id:string;full_name:string;admission_number:string};
async function api<T>(url:string, options?:RequestInit):Promise<T>{
  const response=await fetch(url,{cache:"no-store",...options});
  const body=await response.json();
  if(!response.ok)throw new Error(typeof body.error==="string"?body.error:body.error?.message||"Request failed");
  return body as T;
}
const json=(value:unknown, method:"POST"|"PUT"="POST"):RequestInit=>({
  method,headers:{"Content-Type":"application/json"},body:JSON.stringify(value),
});

export default function ParentsManagementPage(){
  const [parents,setParents]=useState<Parent[]>([]);
  const [selectedId,setSelectedId]=useState("");
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [showCreate,setShowCreate]=useState(false);
  const [editingChildren,setEditingChildren]=useState(false);
  const [fullName,setFullName]=useState("");
  const [email,setEmail]=useState("");
  const [phone,setPhone]=useState("");
  const [studentSearch,setStudentSearch]=useState("");
  const [studentResults,setStudentResults]=useState<Child[]>([]);
  const [chosen,setChosen]=useState<Selection[]>([]);

  const load=useCallback(async()=>{
    setLoading(true);
    try{
      const data=await api<{parents:Parent[]}>("/api/admin/parents");
      setParents(data.parents);
      setSelectedId(id=>data.parents.some(p=>p.id===id)?id:data.parents[0]?.id||"");
      setError("");
    }catch(e){setError(e instanceof Error?e.message:"Could not load families.");}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{void load();},[load]);
  useEffect(()=>{
    let active=true;
    const q=new URLSearchParams();
    if(studentSearch.trim())q.set("q",studentSearch.trim());
    void api<{students:Child[]}>("/api/admin/parents/students?"+q).then(data=>{
      if(active)setStudentResults(data.students);
    }).catch(e=>{
      if(active)setError(e instanceof Error?e.message:"Student search failed.");
    });
    return ()=>{active=false;};
  },[studentSearch]);

  const current=parents.find(p=>p.id===selectedId);
  function chooseStudent(student:Child){
    setChosen(list=>list.some(item=>item.id===student.id)
      ?list.filter(item=>item.id!==student.id)
      :[...list,{id:student.id,full_name:student.full_name,admission_number:student.admission_number}]);
  }
  function startCreate(){
    setShowCreate(true);setEditingChildren(false);setFullName("");setEmail("");setPhone("");
    setChosen([]);setStudentSearch("");setError("");setNotice("");
  }
  function editChildren(){
    if(!current)return;
    setChosen((current.parent_students||[]).filter(x=>x.students).map(x=>({
      id:x.student_id,full_name:x.students!.full_name,admission_number:x.students!.admission_number,
    })));
    setStudentSearch("");setEditingChildren(true);setShowCreate(false);setError("");setNotice("");
  }
  async function createParent(e:FormEvent<HTMLFormElement>){
    e.preventDefault();
    setBusy(true);setError("");setNotice("");
    try{
      const result=await api<{message:string}>("/api/admin/parents",
        json({fullName,email,phone,studentIds:chosen.map(s=>s.id)}));
      setNotice(result.message);setShowCreate(false);setChosen([]);await load();
    }catch(e){setError(e instanceof Error?e.message:"Parent account creation failed.");}
    finally{setBusy(false);}
  }
  async function saveChildren(){
    if(!current)return;
    setBusy(true);setError("");setNotice("");
    try{
      const result=await api<{message:string}>("/api/admin/parents/"+current.id+"/children",
        json({studentIds:chosen.map(s=>s.id)},"PUT"));
      setNotice(result.message);setEditingChildren(false);await load();
    }catch(e){setError(e instanceof Error?e.message:"Could not update linked children.");}
    finally{setBusy(false);}
  }
  async function resend(){
    if(!current)return;
    setBusy(true);setNotice("");setError("");
    try{
      const result=await api<{message:string}>("/api/admin/parents/"+current.id+"/send-setup",{method:"POST"});
      setNotice(result.message);
    }catch(e){setError(e instanceof Error?e.message:"Email request failed.");}
    finally{setBusy(false);}
  }

  const selectionPanel=<div className="space-y-3">
    <div className="rounded-xl bg-blue-50 px-3 py-2 text-xs text-blue-900">
      Choose the enrolled children this parent is authorized to access. Parent accounts can view only published results of linked children.
    </div>
    <Input id="child-search" label="Find a student by name" maxLength={80}
      placeholder="Search enrolled students" value={studentSearch}
      onChange={e=>setStudentSearch(e.target.value)}/>
    {chosen.length>0&&<div className="flex flex-wrap gap-2">
      {chosen.map(child=><button type="button" key={child.id} onClick={()=>setChosen(old=>old.filter(x=>x.id!==child.id))}
        className="inline-flex items-center gap-1 rounded-lg bg-brand-50 px-2.5 py-1.5 text-xs font-medium text-brand-700">
        {child.full_name} <X className="h-3 w-3"/>
      </button>)}
    </div>}
    <div className="max-h-52 overflow-y-auto rounded-xl border border-slate-200">
      {studentResults.length===0?<p className="p-4 text-sm text-slate-500">No active students found.</p>:
        studentResults.map(child=><label key={child.id}
          className="flex cursor-pointer items-center gap-3 border-b border-slate-100 px-3 py-3 text-sm last:border-0">
          <input type="checkbox" disabled={busy} checked={chosen.some(x=>x.id===child.id)}
            onChange={()=>chooseStudent(child)} className="h-4 w-4 accent-blue-600"/>
          <span><span className="block font-medium">{child.full_name}</span>
            <span className="text-xs text-slate-500">{child.admission_number}</span></span>
        </label>)}
    </div>
    <p className="text-xs text-slate-500">{chosen.length} children selected. Select at least one.</p>
  </div>;

  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h1 className="text-2xl font-semibold text-slate-900">Parents &amp; families</h1>
        <p className="mt-1 text-sm text-slate-500">Create parent logins and manage which children each parent can access.</p></div>
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" onClick={()=>void load()} disabled={loading||busy}>
          <RefreshCw className="h-4 w-4"/>Refresh</Button>
        <Button size="sm" onClick={startCreate}><Plus className="h-4 w-4"/>Add parent</Button>
      </div>
    </div>
    {error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {notice&&<p role="status" className="rounded-xl bg-green-50 p-3 text-sm text-green-800">{notice}</p>}
    {showCreate&&<Card>
      <div className="mb-3 flex items-center justify-between gap-3"><h2 className="font-semibold">Create parent portal account</h2>
        <button aria-label="Close form" type="button" onClick={()=>setShowCreate(false)}><X className="h-4 w-4"/></button></div>
      <p className="mb-4 text-sm text-slate-600">Creates a family login with a random unused password. The parent receives a request to set their own password by email.</p>
      <form onSubmit={createParent} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Input id="parent-name" label="Parent or guardian name" required value={fullName} onChange={e=>setFullName(e.target.value)}/>
          <Input id="parent-email" label="Login email" type="email" required value={email} onChange={e=>setEmail(e.target.value)}/>
          <Input id="parent-phone" label="Phone (optional)" value={phone} onChange={e=>setPhone(e.target.value)}/>
        </div>
        {selectionPanel}
        <Button type="submit" disabled={busy||chosen.length===0} isLoading={busy}>
          <UserRound className="h-4 w-4"/>Create parent account</Button>
      </form>
    </Card>}
    <div className="grid gap-5 lg:grid-cols-[310px_minmax(0,1fr)]">
      <Card>
        <h2 className="mb-4 flex items-center gap-2 font-semibold"><UserRound className="h-5 w-5"/>Families ({parents.length})</h2>
        {loading?<p className="text-sm text-slate-500">Loading families...</p>:
          parents.length===0?<p className="text-sm text-slate-500">No parents registered yet. Choose Add parent.</p>:
          <div className="max-h-[550px] space-y-1 overflow-y-auto">
            {parents.map(p=><button key={p.id} onClick={()=>{setSelectedId(p.id);setEditingChildren(false);setShowCreate(false);}}
              className={"block w-full rounded-xl p-3 text-left text-sm "+
                (selectedId===p.id?"bg-brand-50 text-brand-700":"hover:bg-slate-50")}>
              <span className="block font-semibold">{p.full_name}</span>
              <span className="block break-all text-xs text-slate-500">{p.users?.email||p.email||"No email"}</span>
              <span className="mt-1 block text-xs text-slate-500">{p.parent_students.length} linked children</span>
              {!p.is_active&&<span className="text-xs text-red-600">Inactive</span>}
            </button>)}
          </div>}
      </Card>
      <Card>
        {!current?<p className="text-sm text-slate-500">Select a parent to see linked children.</p>:
          <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><h2 className="font-semibold">{current.full_name}</h2>
                <p className="text-sm text-slate-500">{current.users?.email||current.email||"No email"}</p>
                {current.phone&&<p className="text-xs text-slate-500">{current.phone}</p>}</div>
              <Button variant="secondary" size="sm" disabled={busy||!current.is_active} onClick={()=>void resend()}>
                <Mail className="h-4 w-4"/>Resend setup email
              </Button>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold"><Link2 className="h-4 w-4"/>Linked children</h3>
              <Button size="sm" variant="secondary" disabled={busy||!current.is_active}
                onClick={editChildren}>Change links</Button>
            </div>
            {editingChildren ? <div className="space-y-4">
              {selectionPanel}
              <div className="flex flex-wrap gap-2">
                <Button disabled={busy||chosen.length===0} isLoading={busy} onClick={()=>void saveChildren()}>
                  <Save className="h-4 w-4"/>Save child links</Button>
                <Button variant="secondary" disabled={busy} onClick={()=>setEditingChildren(false)}>Cancel</Button>
              </div>
            </div> : current.parent_students.length===0?
              <p className="text-sm text-slate-500">No children linked to this parent.</p>:
              <div className="space-y-2">
                {current.parent_students.map(row=><div key={row.student_id} className="rounded-xl border border-slate-200 p-3">
                  <p className="font-medium text-slate-900">{row.students?.full_name||"Student record unavailable"}</p>
                  <p className="text-xs text-slate-500">{row.students?.admission_number}</p>
                </div>)}
              </div>}
            <p className="text-xs text-slate-500">Links are checked against your school records before they are saved.</p>
          </div>}
      </Card>
    </div>
  </div>;
}
