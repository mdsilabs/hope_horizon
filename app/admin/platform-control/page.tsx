"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
import {AlertTriangle,Lock,PauseCircle,PlayCircle,RotateCcw,ShieldCheck} from "lucide-react";
import {Card} from "@/components/ui/Card";
import {Button} from "@/components/ui/Button";

type Controls={paused:boolean;notice:string;updatedAt:string;schoolName:string;
  counts:Record<string,number>;resetReady:boolean;
  destructiveResetAvailable:boolean;resetWarning:string;
  latestReset:{id:string;status:string;startedAt:string;
    totalAuthAccounts:number;pendingAuthAccounts:number}|null};
const getMessage=(body:unknown)=> {
  const obj=body as {error?:{message?:string}}|undefined;
  return obj?.error?.message??"Could not complete the operation.";
};
export default function PlatformControlPage(){
  const [control,setControl]=useState<Controls|null>(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState("");
  const [reason,setReason]=useState("School maintenance and configuration updates.");
  const [confirmation,setConfirmation]=useState("");
  const [resetConfirmation,setResetConfirmation]=useState("");
  const [backupReference,setBackupReference]=useState("");
  const [backupConfirmed,setBackupConfirmed]=useState(false);
  const [permanentConfirmed,setPermanentConfirmed]=useState(false);

  async function reload(){
    setBusy(true);
    try{
      const res=await fetch("/api/admin/platform-control",{cache:"no-store"});
      const body=await res.json();
      if(!res.ok)throw new Error(getMessage(body));
      setControl(body as Controls);setError("");
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
  async function resetOperationalData(){
    if(!control||!control.destructiveResetAvailable)return;
    const expected="RESET OPERATIONAL DATA FOR "+control.schoolName;
    if(resetConfirmation!==expected||backupReference.trim().length<12||
      !backupConfirmed||!permanentConfirmed){
      setError("Confirm the backup, the permanent data loss and the exact school reset phrase.");return;
    }
    if(!window.confirm("Permanently erase ALL operational school data, including student records, grades and non-admin staff logins? All administrator accounts remain protected. This cannot be undone without the verified backup."))return;
    setBusy(true);setError("");setMessage("");
    try{
      const response=await fetch("/api/admin/platform-control/reset",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          action:"RESET_OPERATIONAL",expectedCounts:control.counts,
          confirmation:resetConfirmation,backupReference:backupReference.trim(),
          backupRestoredAndVerified:true,acknowledgePermanentDeletion:true,
        }),
      });
      const body=await response.json();
      if(!response.ok)throw new Error(getMessage(body));
      setResetConfirmation("");setPermanentConfirmed(false);setBackupConfirmed(false);
      setMessage(body.message+" If old Auth accounts remain, use Continue Auth cleanup below.");
      await reload();
    }catch(e){setError(e instanceof Error?e.message:"Reset did not complete.");}
    finally{setBusy(false);}
  }
  async function continueAuthCleanup(){
    if(!control?.latestReset||control.latestReset.status!=="AUTH_CLEANUP_PENDING")return;
    setBusy(true);setError("");setMessage("");
    try{
      const response=await fetch("/api/admin/platform-control/reset",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({action:"CLEANUP_AUTH",jobId:control.latestReset.id}),
      });
      const body=await response.json();
      if(!response.ok)throw new Error(body.message||getMessage(body));
      setMessage(body.message);
      await reload();
    }catch(e){setError(e instanceof Error?e.message:"Account cleanup was interrupted; keep the school paused.");}
    finally{setBusy(false);}
  }
  const pending=control?.latestReset?.status==="AUTH_CLEANUP_PENDING";
  const phrase=control?"RESET OPERATIONAL DATA FOR "+control.schoolName:"";
  return <div className="mx-auto max-w-5xl space-y-6">
    <div>
      <Link href="/admin/settings" className="text-sm font-medium text-brand-700 hover:underline">← School settings</Link>
      <h1 className="mt-2 text-2xl font-semibold text-slate-900">Super Admin controls</h1>
      <p className="mt-1 text-sm text-slate-600">
        Only the original Primary Administrator of this school can use installation-wide controls.
        Co-Admins cannot pause or reset school data.
      </p>
    </div>
    {error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {message&&<p role="status" className="rounded-xl bg-green-50 p-3 text-sm text-green-800">{message}</p>}
    {!control?<Card><p className="text-sm text-slate-600">{busy?"Loading platform status…":"Controls not available. Check migration 0018."}</p></Card>:
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
        {pending&&<p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          Previous reset is incomplete. Finish Supabase Auth account cleanup before resuming the school.
        </p>}
        <label className="block text-sm font-medium">
          Type the exact confirmation: <span className="font-mono">{(control.paused?"RESUME ":"PAUSE ")+control.schoolName}</span>
          <input autoComplete="off" spellCheck={false} value={confirmation}
            onChange={e=>setConfirmation(e.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-300 p-3 font-mono text-sm"/>
        </label>
        <Button disabled={busy||!!pending||confirmation!==(control.paused?"RESUME ":"PAUSE ")+control.schoolName}
          onClick={()=>void setPaused()} variant={control.paused?"success":"danger"}>
          {control.paused?<PlayCircle className="h-4 w-4"/>:<PauseCircle className="h-4 w-4"/>}
          {control.paused?"Resume school portal":"Pause entire school portal"}
        </Button>
      </Card>
      <Card className="space-y-4">
        <div className="flex items-start gap-3">
          <Lock className="h-6 w-6 text-red-700"/>
          <div>
            <h2 className="text-lg font-semibold">Reset operational school data</h2>
            <p className="mt-1 text-sm text-slate-600">
              Delete student and parent records, non-admin user accounts, teachers,
              academic sessions, classes, subjects, marks, results, submissions and school notifications.
              Every administrator (PRIMARY and CO_ADMIN), school identity, branding, settings and audit history remain.
            </p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(control.counts).map(([name,count])=><div key={name}
            className="rounded-xl border border-slate-200 p-3">
            <p className="text-xs text-slate-500">{name==="users"?"Non-admin users":name.replaceAll("_"," ")}</p>
            <p className="text-xl font-semibold">{count}</p>
          </div>)}
        </div>
        <p className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0"/>{control.resetWarning}
        </p>
        {pending?<div className="space-y-3 rounded-xl border border-amber-200 p-4">
          <p className="font-semibold text-amber-900">Supabase Auth cleanup in progress</p>
          <p className="text-sm text-slate-700">
            {control.latestReset?.pendingAuthAccounts} of {control.latestReset?.totalAuthAccounts} old user accounts remain.
            The school cannot be resumed until all are removed.
          </p>
          <Button disabled={busy} onClick={()=>void continueAuthCleanup()}>
            <RotateCcw className="h-4 w-4"/> Continue account cleanup (up to 12 per batch)
          </Button>
        </div>:
        <>
          <div className="space-y-3 rounded-xl border border-red-200 p-4">
            <p className="font-semibold text-red-800">Permanent deletion confirmation</p>
            <p className="text-sm text-slate-600">
              Pause the school first. Download and restore-test an independent Supabase backup.
              A backup reference below is your declaration, not an automatically verified backup.
              Supabase Storage and external Cloudinary files may need separate cleanup.
            </p>
            <label className="block text-sm font-medium">
              Verified backup reference (at least 12 characters)
              <input type="text" minLength={12} maxLength={200} autoComplete="off" value={backupReference}
                onChange={e=>setBackupReference(e.target.value)}
                placeholder="Backup filename, timestamp or recovery reference"
                className="mt-1 w-full rounded-xl border p-3 text-sm"/>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" checked={backupConfirmed}
                onChange={e=>setBackupConfirmed(e.target.checked)}/>
              I have restored and verified a backup outside this live school database.
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-1" checked={permanentConfirmed}
                onChange={e=>setPermanentConfirmed(e.target.checked)}/>
              I understand that operational records and all non-admin accounts will be permanently erased. PRIMARY and CO_ADMIN accounts will be preserved.
            </label>
            <label className="block text-sm font-medium">
              Type exactly: <span className="font-mono">{phrase}</span>
              <input value={resetConfirmation} autoComplete="off" spellCheck={false}
                onChange={e=>setResetConfirmation(e.target.value)}
                className="mt-1 w-full rounded-xl border p-3 font-mono text-sm"/>
            </label>
            <Button variant="danger" disabled={busy||!control.destructiveResetAvailable||
                !backupConfirmed||!permanentConfirmed||backupReference.trim().length<12||
                resetConfirmation!==phrase} onClick={()=>void resetOperationalData()}>
              <AlertTriangle className="h-4 w-4"/> Reset operational school data
            </Button>
            {!control.paused&&<p className="text-xs text-red-700">Pause the portal before activating reset.</p>}
            {!control.resetReady&&<p className="text-xs text-red-700">Apply migrations 0019 and 0020 to enable the guarded all-admin-preserving reset.</p>}
          </div>
        </>}
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" disabled={busy} onClick={()=>void reload()}>
            <RotateCcw className="h-4 w-4"/> Refresh record counts
          </Button>
        </div>
        <p className="flex items-center gap-2 text-xs text-slate-500">
          <ShieldCheck className="h-4 w-4"/> Resets affect only this school. All ADMIN accounts, including Co-Admins, and school configuration are protected.
        </p>
      </Card>
    </>}
  </div>;
}
