"use client";
import {useCallback,useEffect,useState} from "react";
import Link from "next/link";
import {ArrowLeft,CheckCircle2,Database,Lock,RefreshCw,ShieldAlert} from "lucide-react";
import {Button} from "@/components/ui/Button";
import {Card} from "@/components/ui/Card";

type Migration={
  id:string;title:string;
  state:"applied"|"already_present"|"pending"|"blocked"|"drift";
  source:"console"|"external"|null;appliedAt:string|null;
};
type Overview={configured:boolean;paused:boolean;note:string;migrations:Migration[]};
const labels:Record<Migration["state"],string>={
  applied:"Applied by Super Admin",
  already_present:"Already installed",
  pending:"Next approved migration",
  blocked:"Waiting for earlier migration",
  drift:"Schema/checksum mismatch",
};
function errorMessage(value:unknown){
  return (value as {error?:{message?:string}})?.error?.message??"Migration request failed.";
}
export default function SuperAdminMigrationsPage(){
  const [overview,setOverview]=useState<Overview|null>(null);
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
  const [selected,setSelected]=useState(""),[confirmation,setConfirmation]=useState("");
  const [error,setError]=useState(""),[notice,setNotice]=useState("");
  const load=useCallback(async()=>{
    setLoading(true);
    try{
      const res=await fetch("/api/admin/platform-control/migrations",{cache:"no-store"});
      const body=await res.json();
      if(!res.ok)throw new Error(errorMessage(body));
      setOverview(body as Overview);
      setSelected((v:string)=>{
        const rows=(body as Overview).migrations;
        return rows.find(m=>m.id===v&&m.state==="pending")?.id??
          rows.find(m=>m.state==="pending")?.id??"";
      });
      setError("");
    }catch(e){setError(e instanceof Error?e.message:"Migration status could not be verified.");}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{void load();},[load]);
  async function apply(){
    const migration=overview?.migrations.find(m=>m.id===selected);
    if(!overview?.configured||!migration||migration.state!=="pending")return;
    const phrase="APPLY "+selected;
    if(confirmation!==phrase){
      setError("Enter "+phrase+" exactly before applying.");return;
    }
    if(!window.confirm("Apply reviewed database migration "+selected+
      "? This modifies the live school's database schema. Ensure an independent backup exists."))return;
    setBusy(true);setNotice("");setError("");
    try{
      const response=await fetch("/api/admin/platform-control/migrations",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({migrationId:selected,confirmation}),
      });
      const body=await response.json();
      if(!response.ok)throw new Error(errorMessage(body));
      setNotice(body.message);setConfirmation("");
      await load();
    }catch(e){setError(e instanceof Error?e.message:"Migration failed. No further updates were attempted.");}
    finally{setBusy(false);}
  }
  const next=overview?.migrations.find(m=>m.id===selected);
  const schemaDrift=overview?.migrations.some(m=>m.state==="drift")??false;
  const pauseRequired=!!overview?.migrations.find(m=>m.id==="0018"&&
    ["applied","already_present"].includes(m.state));
  const canApply=!!overview?.configured&&!!next&&next.state==="pending"&&
    !schemaDrift&&(!pauseRequired||overview?.paused);

  return <div className="mx-auto max-w-5xl space-y-6">
    <div>
      <Link href="/admin/platform-control"
        className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline">
        <ArrowLeft className="h-4 w-4"/> Super Admin controls
      </Link>
      <h1 className="mt-3 flex items-center gap-2 text-2xl font-semibold text-slate-900">
        <Database className="h-6 w-6"/> Database migrations
      </h1>
      <p className="mt-1 text-sm text-slate-600">
        Review the current schema and apply one developer-approved migration at a time.
        The system checks its source checksum, order, Super Admin identity and database project.
      </p>
    </div>
    {error&&<p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-800">{error}</p>}
    {notice&&<p role="status" className="rounded-xl bg-green-50 p-4 text-sm text-green-800">{notice}</p>}
    {loading&&!overview?<Card>Checking the database migration history…</Card>:
      !overview?<Card>Migration status is unavailable.</Card>:
      <>
        <Card className="space-y-2">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-1 h-5 w-5 text-brand-700"/>
            <div>
              <p className="font-semibold text-slate-900">
                {overview.configured?"Approved migration runner connected":"Migration runner needs server configuration"}
              </p>
              <p className="mt-1 text-sm text-slate-600">{overview.note}</p>
              <p className="mt-1 text-xs text-slate-500">
                {overview.paused?"Portal paused: schema changes permitted.":
                 "Portal active: pause before upgrades after maintenance migration 0018."}
              </p>
            </div>
          </div>
          <Button size="sm" variant="secondary" disabled={loading||busy} onClick={()=>void load()}>
            <RefreshCw className="h-4 w-4"/> Check migration status
          </Button>
        </Card>
        {!overview.configured&&<Card>
          <p className="text-sm text-slate-700">
            Your developer must configure the server-only PostgreSQL connection and
            enable the migration runner in the Vercel environment first.
            Database credentials are never displayed in this panel.
          </p>
        </Card>}
        {schemaDrift&&<p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Migration drift detected. No schema updates will be allowed until the migration history and
          installed functions are reviewed by the developer.
        </p>}
        <Card className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Approved database updates</h2>
            <p className="mt-1 text-sm text-slate-600">
              An update marked Already installed was detected in the database even if it was
              originally applied outside this console.
            </p>
          </div>
          {!overview.migrations.length?<p className="text-sm text-slate-500">
            Migration inventory will appear when the runner is configured.
          </p>:
          <div className="divide-y divide-slate-100">
            {overview.migrations.map(m=><div key={m.id}
              className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="flex items-start gap-3">
                {["applied","already_present"].includes(m.state)?
                  <CheckCircle2 className="mt-0.5 h-5 w-5 text-green-700"/>:
                  <Lock className="mt-0.5 h-5 w-5 text-slate-400"/>}
                <div>
                  <p className="text-sm font-semibold">{m.id} · {m.title}</p>
                  <p className="text-xs text-slate-500">{labels[m.state]}</p>
                  {m.appliedAt&&<p className="text-xs text-slate-500">
                    Applied {new Date(m.appliedAt).toLocaleString("en-NG")}
                  </p>}
                </div>
              </div>
              {m.state==="pending"&&<span className="text-xs font-semibold text-brand-700">
                Next available
              </span>}
            </div>)}
          </div>}
        </Card>
        {next&&<Card className="space-y-4">
          <div>
            <h2 className="font-semibold text-slate-900">Apply migration {next.id}</h2>
            <p className="mt-1 text-sm text-slate-600">{next.title}</p>
          </div>
          <p className="text-sm text-amber-800">
            Apply changes on staging first and verify your backup. Published results
            and family accounts must be protected by the migration being applied.
          </p>
          {pauseRequired&&!overview.paused&&<p className="text-sm text-red-700">
            Pause the portal from Super Admin controls before applying this migration.
          </p>}
          <label htmlFor="migration-confirmation" className="block text-sm font-medium">
            Type <code className="font-mono">APPLY {next.id}</code> exactly
          </label>
          <input id="migration-confirmation" autoComplete="off" spellCheck={false}
            className="w-full rounded-xl border border-slate-300 px-3 py-2.5 font-mono text-sm"
            value={confirmation} onChange={e=>setConfirmation(e.target.value)}
            placeholder={"APPLY "+next.id}/>
          <Button onClick={()=>void apply()} disabled={!canApply||busy||confirmation!=="APPLY "+next.id}>
            <Database className="h-4 w-4"/> {busy?"Applying…":"Apply approved migration"}
          </Button>
        </Card>}
      </>}
  </div>;
}
