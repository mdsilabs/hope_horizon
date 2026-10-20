"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
import {AlertTriangle,Lock,PauseCircle,PlayCircle,RotateCcw,ShieldCheck} from "lucide-react";
import {Card} from "@/components/ui/Card";
import {Button} from "@/components/ui/Button";

type Controls={paused:boolean;notice:string;updatedAt:string;schoolName:string;
  counts:Record<string,number|null>;destructiveResetAvailable:boolean;resetWarning:string};
const getMessage=(body:unknown)=> {
  const obj=body as {error?:{message?:string}}|undefined;
  return obj?.error?.message??"Could not complete the operation.";
};
export default function PlatformControlPage(){
  const [control,setControl]=useState<Controls|null>(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState("");
  const [reason,setReason]=useState("School maintenance and configuration updates.");
  const [confirmation,setConfirmation]=useState("");
  async function reload(){
    setBusy(true);setError("");
    try{
      const res=await fetch("/api/admin/platform-control",{cache:"no-store"});
      const body=await res.json();
      if(!res.ok)throw new Error(getMessage(body));
      setControl(body as Controls);
    }catch(e){setError(e instanceof Error?e.message:"Unable to load platform controls.");}
    finally{setBusy(false);}
  }
  useEffect(()=>{void reload();},[]);
  async function setPaused(){
    if(!control)return;
    const action=control.paused?"RESUME":"PAUSE";
    const expected=action+" "+control.schoolName;
    if(confirmation!==expected){
      setError("Type the exact confirmation shown below before continuing.");return;
    }
    if(!control.paused&&reason.trim().length<10){
      setError("Provide a maintenance reason of at least ten characters.");return;
    }
    if(!window.confirm(action==="PAUSE"?
      "Pause access to the entire school portal, including result viewing and data entry?":
      "Resume school portal access for all users?"))return;
    setBusy(true);setError("");setMessage("");
    try{
      const res=await fetch("/api/admin/platform-control",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({action,confirmation,
          ...(action==="PAUSE"?{reason:reason.trim()}:{})}),
      });
      const body=await res.json();
      if(!res.ok)throw new Error(getMessage(body));
      setConfirmation("");setMessage(body.message);await reload();
    }catch(e){setError(e instanceof Error?e.message:"Unable to change maintenance status.");}
    finally{setBusy(false);}
  }
  return <div className="mx-auto max-w-5xl space-y-6">
    <div>
      <Link href="/admin/settings" className="text-sm font-medium text-brand-700 hover:underline">← School settings</Link>
      <h1 className="mt-2 text-2xl font-semibold text-slate-900">Platform owner controls</h1>
      <p className="mt-1 text-sm text-slate-600">
        These controls require the vendor-level owner account configured for this installation.
        Ordinary school administrators cannot use them.
      </p>
    </div>
    {error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {message&&<p role="status" className="rounded-xl bg-green-50 p-3 text-sm text-green-800">{message}</p>}
    {!control?<Card><p className="text-sm text-slate-600">{busy?"Loading platform status…":"Controls not available. Check owner configuration and migration 0018."}</p></Card>:
    <>
      <Card className="space-y-4">
        <div className="flex items-start gap-3">
          {control.paused?<PauseCircle className="h-7 w-7 text-amber-700"/>:<PlayCircle className="h-7 w-7 text-green-700"/>}
          <div>
            <h2 className="text-lg font-semibold">{control.paused?"School portal paused":"School portal active"}</h2>
            <p className="mt-1 text-sm text-slate-600">
              {control.paused?control.notice:"Parents, teachers, students and administrators can use the portal normally."}
            </p>
            <p className="mt-1 text-xs text-slate-500">Last updated: {new Date(control.updatedAt).toLocaleString("en-NG")}</p>
          </div>
        </div>
        {!control.paused&&<label className="block text-sm font-medium">
          Public maintenance message
          <textarea value={reason} minLength={10} maxLength={350} rows={3}
            onChange={e=>setReason(e.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-300 p-3 text-sm"/>
        </label>}
        <label className="block text-sm font-medium">
          Type the exact confirmation: <span className="font-mono">{(control.paused?"RESUME ":"PAUSE ")+control.schoolName}</span>
          <input autoComplete="off" spellCheck={false} value={confirmation}
            onChange={e=>setConfirmation(e.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-300 p-3 font-mono text-sm"/>
        </label>
        <Button disabled={busy||confirmation!==(control.paused?"RESUME ":"PAUSE ")+control.schoolName}
          onClick={()=>void setPaused()} variant={control.paused?"success":"danger"}>
          {control.paused?<PlayCircle className="h-4 w-4"/>:<PauseCircle className="h-4 w-4"/>}
          {control.paused?"Resume school portal":"Pause entire school portal"}
        </Button>
      </Card>
      <Card className="space-y-4">
        <div className="flex items-start gap-3">
          <Lock className="h-6 w-6 text-red-700"/>
          <div>
            <h2 className="text-lg font-semibold">Complete data reset</h2>
            <p className="mt-1 text-sm text-slate-600">
              Inspect the affected records before planning an irreversible reset. A web button
              must never silently destroy school records without backup and a defined scope.
            </p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(control.counts).map(([name,count])=><div key={name}
            className="rounded-xl border border-slate-200 p-3">
            <p className="text-xs text-slate-500">{name.replaceAll("_"," ")}</p>
            <p className="text-xl font-semibold">{count??"Unavailable"}</p>
          </div>)}
        </div>
        <p className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0"/>{control.resetWarning}
        </p>
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" disabled={busy} onClick={()=>void reload()}>
            <RotateCcw className="h-4 w-4"/> Refresh reset preview
          </Button>
          <Button variant="danger" disabled title="Locked pending reset scope, backup verification and independent authorization">
            <Lock className="h-4 w-4"/> Truncate all data (locked)
          </Button>
        </div>
        <p className="flex items-center gap-2 text-xs text-slate-500">
          <ShieldCheck className="h-4 w-4"/> This page cannot delete school records. Reset activation requires a separate guarded implementation.
        </p>
      </Card>
    </>}
  </div>;
}
