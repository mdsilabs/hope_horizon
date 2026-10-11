"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Plus, RefreshCw, Send, Users } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";

type Teacher = {id:string;full_name:string;staff_id:string;user_id:string;is_active:boolean;
  users:{email:string;is_active:boolean}|null;
  teacher_classes:{class_id:string}[];
  teacher_subject_assignments:{class_id:string;subject_id:string}[]};
type SchoolClass={id:string;name:string;arm:string|null;is_active:boolean;class_subjects:{subject_id:string}[]};
type Subject={id:string;name:string;code:string;is_active:boolean};
type Assignment={classId:string;subjectId:string};

async function call<T>(url:string, options?:RequestInit):Promise<T> {
  const result=await fetch(url,{cache:"no-store",...options});
  const body=await result.json();
  if (!result.ok) throw new Error(typeof body.error==="string"?body.error:body.error?.message||"Request failed");
  return body as T;
}
const json=(data:unknown, method="POST"):RequestInit=>({method,headers:{"Content-Type":"application/json"},body:JSON.stringify(data)});
export default function TeacherAdminPage() {
  const [teachers,setTeachers]=useState<Teacher[]>([]);
  const [classes,setClasses]=useState<SchoolClass[]>([]);
  const [subjects,setSubjects]=useState<Subject[]>([]);
  const [selected,setSelected]=useState("");
  const [fullName,setFullName]=useState("");
  const [email,setEmail]=useState("");
  const [staffId,setStaffId]=useState("");
  const [showCreate,setShowCreate]=useState(false);
  const [assignedClassIds,setAssignedClassIds]=useState<string[]>([]);
  const [subjectAssignments,setSubjectAssignments]=useState<Assignment[]>([]);
  const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
  const [error,setError]=useState(""),[notice,setNotice]=useState("");

  const reload=useCallback(async()=>{
    setLoading(true);
    try {
      const [t,c,s]=await Promise.all([
        call<{teachers:Teacher[]}>("/api/admin/teachers"),
        call<{classes:SchoolClass[]}>("/api/admin/classes"),
        call<{subjects:Subject[]}>("/api/admin/subjects"),
      ]);
      setTeachers(t.teachers);setClasses(c.classes.filter(x=>x.is_active));setSubjects(s.subjects.filter(x=>x.is_active));
      setSelected(old=>t.teachers.some(x=>x.id===old)?old:t.teachers[0]?.id||"");
      setError("");
    }catch(e){setError(e instanceof Error?e.message:"Unable to load teachers.");}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{void reload();},[reload]);
  useEffect(()=>{
    const t=teachers.find(x=>x.id===selected);
    setAssignedClassIds((t?.teacher_classes||[]).map(x=>x.class_id));
    setSubjectAssignments((t?.teacher_subject_assignments||[]).map(x=>({classId:x.class_id,subjectId:x.subject_id})));
  },[selected,teachers]);

  async function provision(e:FormEvent<HTMLFormElement>){
    e.preventDefault();setBusy(true);setError("");setNotice("");
    try{
      const result=await call<{message:string}>("/api/admin/teachers",json({fullName,email,staffId}));
      setNotice(result.message);
      setFullName("");setEmail("");setStaffId("");setShowCreate(false);
      await reload();
    }catch(e){setError(e instanceof Error?e.message:"Teacher could not be created.");}
    finally{setBusy(false);}
  }
  async function save(){
    setBusy(true);setNotice("");setError("");
    try{
      await call("/api/admin/teachers/"+selected+"/assignments",json({assignedClassIds,subjectAssignments},"PUT"));
      setNotice("Class and subject assignments saved.");await reload();
    }catch(e){setError(e instanceof Error?e.message:"Assignment update failed.");}
    finally{setBusy(false);}
  }
  async function resend(){
    setBusy(true);setNotice("");setError("");
    try{
      const r=await call<{message:string}>("/api/admin/teachers/"+selected+"/send-setup",{method:"POST"});
      setNotice(r.message);
    }catch(e){setError(e instanceof Error?e.message:"Email request failed.");}
    finally{setBusy(false);}
  }
  const active=teachers.find(t=>t.id===selected);
  const isAssigned=(classId:string,subjectId:string)=>subjectAssignments.some(a=>a.classId===classId&&a.subjectId===subjectId);
  function toggleSubject(classId:string,subjectId:string){
    setSubjectAssignments(old=>isAssigned(classId,subjectId)
      ?old.filter(a=>!(a.classId===classId&&a.subjectId===subjectId))
      :[...old,{classId,subjectId}]);
  }

  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-2xl font-semibold text-slate-900">Teacher management</h1>
        <p className="mt-1 text-sm text-slate-500">Provision staff and decide which classes and subjects they teach.</p></div>
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" onClick={()=>void reload()} disabled={busy||loading}><RefreshCw className="h-4 w-4"/>Refresh</Button>
        <Button size="sm" onClick={()=>setShowCreate(v=>!v)}><Plus className="h-4 w-4"/>Add teacher</Button>
      </div>
    </div>
    {error&&<div className="rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</div>}
    {notice&&<div className="rounded-xl bg-green-50 p-3 text-sm text-green-800" role="status">{notice}</div>}
    {showCreate&&<Card><h2 className="mb-3 font-semibold">Create teacher account</h2>
      <p className="mb-4 text-sm text-slate-600">The teacher gets their own account. A setup email is requested; no temporary password is shown to administrators.</p>
      <form className="grid gap-3 sm:grid-cols-3" onSubmit={provision}>
        <Input label="Full name" value={fullName} required onChange={e=>setFullName(e.target.value)}/>
        <Input label="Email address" type="email" value={email} required onChange={e=>setEmail(e.target.value)}/>
        <Input label="Staff ID" value={staffId} required onChange={e=>setStaffId(e.target.value)}/>
        <div className="sm:col-span-3"><Button disabled={busy} isLoading={busy} type="submit">Create account</Button></div>
      </form>
    </Card>}
    <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
      <Card>
        <h2 className="mb-3 flex items-center gap-2 font-semibold"><Users className="h-5 w-5"/>Teaching staff ({teachers.length})</h2>
        {loading?<p className="text-sm text-slate-500">Loading staff...</p>:
          teachers.length===0?<p className="text-sm text-slate-500">No teachers registered yet.</p>:
          <div className="max-h-[600px] space-y-1 overflow-auto">
            {teachers.map(t=><button key={t.id} type="button" onClick={()=>setSelected(t.id)}
              className={"block w-full rounded-xl px-3 py-3 text-left text-sm "+(selected===t.id?"bg-brand-50 text-brand-700":"hover:bg-slate-50")}>
              <span className="block font-semibold">{t.full_name}</span>
              <span className="block break-all text-xs text-slate-500">{t.staff_id} · {t.users?.email||"No email"}</span>
              {!t.is_active&&<span className="text-xs text-red-600">Inactive</span>}
            </button>)}
          </div>}
      </Card>
      <Card>
        {!active?<p className="text-sm text-slate-500">Select a teacher to configure assignments.</p>:
          <>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><h2 className="font-semibold">{active.full_name}</h2>
                <p className="text-sm text-slate-500">{active.staff_id} · {active.users?.email}</p></div>
              <Button size="sm" variant="secondary" disabled={busy||!active.is_active} onClick={()=>void resend()}>
                <Send className="h-4 w-4"/>Resend setup email</Button>
            </div>
            <h3 className="mb-2 mt-5 text-sm font-semibold">Assigned classes</h3>
            <p className="mb-3 text-xs text-slate-500">Select the classes assigned to this teacher. Subject-specific assignments can be set below.</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {classes.map(c=><label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 p-3 text-sm" key={c.id}>
                <input type="checkbox" disabled={busy||!active.is_active} checked={assignedClassIds.includes(c.id)}
                  onChange={()=>setAssignedClassIds(old=>old.includes(c.id)?old.filter(id=>id!==c.id):[...old,c.id])}/>
                {c.name}{c.arm?" "+c.arm:""}
              </label>)}
            </div>
            <h3 className="mb-2 mt-6 text-sm font-semibold">Subject assignments</h3>
            <p className="mb-3 text-xs text-slate-500">Subjects must first be attached to classes in Classes &amp; Subjects.</p>
            {classes.map(c=>{
              const available=subjects.filter(s=>c.class_subjects.some(link=>link.subject_id===s.id));
              return available.length>0?<div className="mb-4" key={c.id}>
                <p className="mb-2 text-sm font-semibold text-slate-700">{c.name}{c.arm?" "+c.arm:""}</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {available.map(s=><label key={s.id} className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 p-2.5 text-sm">
                    <input type="checkbox" disabled={busy||!active.is_active} checked={isAssigned(c.id,s.id)}
                      onChange={()=>toggleSubject(c.id,s.id)}/>{s.name}
                  </label>)}
                </div>
              </div>:null;
            })}
            <div className="mt-4"><Button disabled={busy||!active.is_active} isLoading={busy} onClick={()=>void save()}>Save assignments</Button></div>
          </>}
      </Card>
    </div>
  </div>;
}
