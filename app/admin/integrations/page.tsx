"use client";
import { useState } from "react";
import { Activity, CheckCircle2, AlertTriangle, CircleX, RefreshCw, Mail } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
type Check={name:string;status:"pass"|"warn"|"fail";detail:string};
export default function IntegrationChecks(){
  const [checks,setChecks]=useState<Check[]>([]),[checkedAt,setCheckedAt]=useState("");
  const [busy,setBusy]=useState(false),[testing,setTesting]=useState(false),[notice,setNotice]=useState(""),[error,setError]=useState("");
  async function run(){
    setBusy(true);setError("");
    try{
      const response=await fetch("/api/admin/integrations",{cache:"no-store"});
      const data=await response.json();
      if(!response.ok)throw new Error(typeof data.error==="string"?data.error:data.error?.message||"Check failed");
      setChecks(data.checks);setCheckedAt(data.checkedAt);
    }catch(e){setError(e instanceof Error?e.message:"Cannot check integrations.");}
    finally{setBusy(false);}
  }
  async function testMail(){
    setTesting(true);setError("");setNotice("");
    try{
      const response=await fetch("/api/admin/integrations/test-email",{method:"POST"});
      const data=await response.json();
      if(!response.ok)throw new Error(data?.error?.message||"Gmail SMTP test failed.");
      setNotice(data.message);
    }catch(e){setError(e instanceof Error?e.message:"Could not test Gmail SMTP.");}
    finally{setTesting(false);}
  }
  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900"><Activity className="h-6 w-6"/>Integration health</h1>
        <p className="mt-1 text-sm text-slate-500">Diagnostics for authentication, databases, migrations and Gmail SMTP.</p></div>
      <Button disabled={busy} isLoading={busy} onClick={()=>void run()}><RefreshCw className="h-4 w-4"/>Run checks</Button>
    </div>
    <Card><h2 className="mb-1 font-semibold">What these checks do</h2>
      <p className="text-sm text-slate-600">Run checks is read-only and never exposes credentials. The separate Gmail SMTP test sends one message to your own administrator email, subject to a cooldown.</p>
      <p className="mt-3 text-sm text-slate-600">For a Windows setup assistant, run <code className="rounded bg-slate-100 px-1">scripts\check-integrations.cmd</code> from the cloned project.</p>
    </Card>
    <Card className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="font-semibold text-slate-900">Gmail SMTP verification</h2>
        <p className="mt-1 text-sm text-slate-600">
          Send a test email to your signed-in administrator address. Configure Gmail SMTP in Vercel
          and separately in Supabase Auth for account invitation emails.
        </p>
      </div>
      <Button variant="secondary" disabled={testing||busy} isLoading={testing} onClick={()=>void testMail()}>
        <Mail className="h-4 w-4"/> Test Gmail SMTP
      </Button>
    </Card>
    {notice&&<p role="status" className="rounded-xl bg-green-50 p-3 text-sm text-green-700">{notice}</p>}
    {error&&<div role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}
    {checkedAt&&<p className="text-xs text-slate-500">Last checked: {new Date(checkedAt).toLocaleString()}</p>}
    <div className="grid gap-3 md:grid-cols-2">
      {checks.map((c,i)=><Card key={c.name+i} className="flex gap-3">
        {c.status==="pass"?<CheckCircle2 className="h-5 w-5 shrink-0 text-green-600"/>:
          c.status==="warn"?<AlertTriangle className="h-5 w-5 shrink-0 text-amber-600"/>:
          <CircleX className="h-5 w-5 shrink-0 text-red-600"/>}
        <div><p className="text-sm font-semibold text-slate-900">{c.name}</p>
          <p className="mt-1 text-sm text-slate-600">{c.detail}</p>
          <p className="mt-2 text-xs font-semibold uppercase text-slate-500">{c.status==="pass"?"Passed":c.status==="warn"?"Needs review":"Failed"}</p>
        </div>
      </Card>)}
    </div>
    {checks.length===0&&!busy&&<Card><p className="text-sm text-slate-500">Select Run checks to inspect current integrations.</p></Card>}
  </div>;
}
