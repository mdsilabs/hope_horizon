"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { CalendarDays, CheckCircle2, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";

type Session={id:string;name:string;start_date:string;end_date:string;is_current:boolean;is_active:boolean};
type Term={id:string;name:string;order:number;academic_session_id:string;
  start_date:string;end_date:string;is_current:boolean;is_active:boolean};
type School={academic_period_label:string;periods_per_session:number;
  current_academic_session_id:string|null;current_term_id:string|null};
async function api<T>(url:string, data?:unknown):Promise<T>{
  const resp=await fetch(url,{cache:"no-store",...(data?{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(data)}:{})});
  const result=await resp.json();
  if(!resp.ok)throw new Error(typeof result.error==="string"?result.error:result.error?.message||"Request failed");
  return result as T;
}
export default function AcademicAdminPage(){
  const [sessions,setSessions]=useState<Session[]>([]),[terms,setTerms]=useState<Term[]>([]);
  const [school,setSchool]=useState<School|null>(null),[selectedSession,setSelectedSession]=useState("");
  const [name,setName]=useState(""),[from,setFrom]=useState(""),[to,setTo]=useState("");
  const [termName,setTermName]=useState(""),[termOrder,setTermOrder]=useState("1");
  const [termFrom,setTermFrom]=useState(""),[termTo,setTermTo]=useState("");
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
  const [error,setError]=useState(""),[notice,setNotice]=useState("");
  const reload=useCallback(async()=>{
    setLoading(true);
    try{
      const data=await api<{school:School;sessions:Session[];terms:Term[]}>("/api/admin/academic");
      setSchool(data.school);setSessions(data.sessions);setTerms(data.terms);
      setSelectedSession(old=>data.sessions.some(x=>x.id===old)?old:data.school?.current_academic_session_id||data.sessions[0]?.id||"");
      setError("");
    }catch(e){setError(e instanceof Error?e.message:"Unable to load academic periods.");}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{void reload();},[reload]);

  async function addSession(e:FormEvent<HTMLFormElement>){
    e.preventDefault();setBusy(true);setNotice("");setError("");
    try{
      await api("/api/admin/academic",{name,startDate:from,endDate:to});
      setNotice("Academic session added. Create a term before activating it.");
      setName("");setFrom("");setTo("");await reload();
    }catch(e){setError(e instanceof Error?e.message:"Session creation failed.");}
    finally{setBusy(false);}
  }
  async function addTerm(e:FormEvent<HTMLFormElement>){
    e.preventDefault();setBusy(true);setNotice("");setError("");
    try{
      await api("/api/admin/academic/terms",{academicSessionId:selectedSession,
        name:termName,order:Number(termOrder),startDate:termFrom,endDate:termTo});
      setTermName("");setTermOrder("1");setTermFrom("");setTermTo("");
      setNotice("Period added successfully.");await reload();
    }catch(e){setError(e instanceof Error?e.message:"Period creation failed.");}
    finally{setBusy(false);}
  }
  async function activate(t:Term){
    if(!window.confirm("Set "+t.name+" as the current academic period? New results will use the selected period."))return;
    setBusy(true);setError("");setNotice("");
    try{
      await api("/api/admin/academic/activate",{termId:t.id});
      setNotice("Current session and term updated together.");await reload();
    }catch(e){setError(e instanceof Error?e.message:"Could not activate period.");}
    finally{setBusy(false);}
  }
  const currentTerm=terms.find(t=>t.id===school?.current_term_id);
  const currentSession=sessions.find(s=>s.id===school?.current_academic_session_id);
  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-2xl font-semibold text-slate-900">Academic sessions</h1>
        <p className="mt-1 text-sm text-slate-500">Manage school years and their terms. Activate one term to enable current result entry.</p></div>
      <Button variant="secondary" size="sm" disabled={busy||loading} onClick={()=>void reload()}><RefreshCw className="h-4 w-4"/> Refresh</Button>
    </div>
    {error&&<div role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}
    {notice&&<div role="status" className="rounded-xl bg-green-50 p-3 text-sm text-green-800">{notice}</div>}
    <Card className="flex flex-wrap items-center gap-4">
      <div className="rounded-xl bg-brand-50 p-3"><CalendarDays className="h-6 w-6 text-brand-600"/></div>
      <div><p className="text-xs font-semibold uppercase text-slate-500">Current academic period</p>
        <h2 className="text-lg font-semibold">{currentSession?.name||"No active session"}</h2>
        <p className="text-sm text-slate-600">{currentTerm?.name||"No active term"}</p></div>
    </Card>
    <div className="grid gap-5 lg:grid-cols-2">
      <Card><h2 className="mb-4 flex items-center gap-2 font-semibold"><Plus className="h-4 w-4"/> Add academic session</h2>
        <form onSubmit={addSession} className="space-y-3">
          <Input label="Session name" placeholder="2026/2027" required value={name} onChange={e=>setName(e.target.value)}/>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Starting date" type="date" required value={from} onChange={e=>setFrom(e.target.value)}/>
            <Input label="Ending date" type="date" required value={to} onChange={e=>setTo(e.target.value)}/>
          </div>
          <Button type="submit" disabled={busy} isLoading={busy}>Create session</Button>
        </form>
      </Card>
      <Card><h2 className="mb-4 flex items-center gap-2 font-semibold"><Plus className="h-4 w-4"/> Add {school?.academic_period_label||"term"}</h2>
        <form onSubmit={addTerm} className="space-y-3">
          <Select label="Academic session" value={selectedSession} required options={sessions.filter(s=>s.is_active).map(s=>({label:s.name,value:s.id}))}
            onChange={e=>setSelectedSession(e.target.value)}/>
          <Input label="Period name" placeholder="First Term" required value={termName} onChange={e=>setTermName(e.target.value)}/>
          <Input label="Order in session" type="number" min={1} max={school?.periods_per_session||3} required value={termOrder} onChange={e=>setTermOrder(e.target.value)}/>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Starting date" type="date" required value={termFrom} onChange={e=>setTermFrom(e.target.value)}/>
            <Input label="Ending date" type="date" required value={termTo} onChange={e=>setTermTo(e.target.value)}/>
          </div>
          <Button type="submit" isLoading={busy} disabled={busy||!selectedSession}>Create period</Button>
        </form>
      </Card>
    </div>
    <Card><h2 className="mb-3 font-semibold">Registered sessions and periods</h2>
      {loading?<p className="text-sm text-slate-500">Loading periods...</p>:
        sessions.length===0?<p className="text-sm text-slate-500">Add your first academic session above.</p>:
        <div className="space-y-5">{sessions.map(s=><section key={s.id} className="rounded-xl border border-slate-200 p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">{s.name}</h3>
            {s.is_current&&<span className="rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">Current</span>}
            <span className="text-xs text-slate-500">{s.start_date} to {s.end_date}</span>
          </div>
          <div className="space-y-2">
            {terms.filter(t=>t.academic_session_id===s.id).length===0&&<p className="text-sm text-slate-500">No terms created yet.</p>}
            {terms.filter(t=>t.academic_session_id===s.id).sort((a,b)=>a.order-b.order).map(t=>
              <div key={t.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-50 p-3">
                <div><p className="flex items-center gap-2 text-sm font-semibold">{t.name}{t.is_current&&<CheckCircle2 className="h-4 w-4 text-green-600"/>}</p>
                  <p className="text-xs text-slate-500">{t.start_date} to {t.end_date}</p></div>
                <Button size="sm" variant={t.is_current?"secondary":"primary"} disabled={busy||t.is_current||!t.is_active||!s.is_active}
                  onClick={()=>void activate(t)}>{t.is_current?"Active":"Set current"}</Button>
              </div>)}
          </div>
        </section>)}</div>}
    </Card>
  </div>;
}
