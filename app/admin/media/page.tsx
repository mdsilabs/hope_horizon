"use client";

import { useCallback,useEffect,useState,type FormEvent } from "react";
import Link from "next/link";
import { Cloud, RefreshCw, Save, ShieldCheck, FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";

type Settings={cloud_name:string;folder:string;enabled:boolean};
type Config={settings:Settings;credentialsConfigured:boolean;cloudNamePinned:boolean};
function getError(body:unknown):string {
  return (body as {error?:{message?:string}})?.error?.message||"Request failed.";
}

export default function CloudinaryPage(){
  const [settings,setSettings]=useState<Settings>({cloud_name:"",folder:"avatars",enabled:false});
  const [configured,setConfigured]=useState(false),[pinned,setPinned]=useState(false);
  const [busy,setBusy]=useState(false),[testing,setTesting]=useState(false),[loading,setLoading]=useState(true);
  const [notice,setNotice]=useState(""),[error,setError]=useState("");
  const load=useCallback(async()=>{
    setLoading(true);
    try{
      const response=await fetch("/api/admin/media",{cache:"no-store"});
      const body=await response.json();
      if(!response.ok)throw new Error(getError(body));
      const data=body as Config;
      setSettings(data.settings);setConfigured(data.credentialsConfigured);setPinned(data.cloudNamePinned);setError("");
    }catch(e){setError(e instanceof Error?e.message:"Cannot load Cloudinary settings.");}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{void load();},[load]);
  async function save(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setBusy(true);setNotice("");setError("");
    try{
      const response=await fetch("/api/admin/media",{
        method:"PUT",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({cloudName:settings.cloud_name,folder:settings.folder,enabled:settings.enabled}),
      });
      const body=await response.json();
      if(!response.ok)throw new Error(getError(body));
      setSettings(body.settings);setConfigured(body.credentialsConfigured);
      setNotice("Cloudinary settings saved for your school.");
    }catch(e){setError(e instanceof Error?e.message:"Cloudinary settings could not be saved.");}
    finally{setBusy(false);}
  }
  async function test(){
    setTesting(true);setNotice("");setError("");
    try{
      const response=await fetch("/api/admin/media/test",{method:"POST"});
      const body=await response.json();
      if(!response.ok)throw new Error(getError(body));
      setNotice(body.message);
    }catch(e){setError(e instanceof Error?e.message:"Cloudinary connection failed.");}
    finally{setTesting(false);}
  }
  return <div className="mx-auto max-w-3xl space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-sm font-semibold text-brand-700">Integrations</p>
        <h1 className="mt-1 font-display text-2xl font-semibold text-slate-900">Cloudinary configuration</h1>
        <p className="mt-1 text-sm text-slate-500">Configure secure image uploads for school user profiles.</p></div>
      <Button size="sm" variant="secondary" onClick={()=>void load()} disabled={busy||loading}><RefreshCw className="h-4 w-4"/>Refresh</Button>
    </div>
    {error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {notice&&<p role="status" className="rounded-xl bg-green-50 p-3 text-sm text-green-800">{notice}</p>}
    <Card>
      <div className="flex flex-wrap items-center gap-3">
        <Cloud className="h-7 w-7 text-brand-600"/>
        <div><p className="font-semibold">Server credentials</p>
          <p className={"text-sm "+(configured?"text-green-700":"text-amber-700")}>
            {configured?"API key and secret are present on the server.":"API key or secret is missing on the server."}</p>
        </div>
      </div>
      <p className="mt-3 text-sm text-slate-600">
        In Vercel, set <code>CLOUDINARY_API_KEY</code> and <code>CLOUDINARY_API_SECRET</code> under
        Project Settings → Environment Variables (server-only). The optional
        <code className="mx-1">CLOUDINARY_CLOUD_NAME</code> locks this deployment to one Cloudinary environment.
        Redeploy after changing these variables.
      </p>
      <p className="mt-2 text-xs text-slate-500">
        {pinned?"This deployment pins a cloud name using CLOUDINARY_CLOUD_NAME.":"Cloud name is selected through the school settings below."}
        {" "}API secrets are never stored in the database or displayed in this panel.
      </p>
    </Card>
    {loading?<Card><p className="text-sm text-slate-500">Loading configuration...</p></Card>:
      <Card>
        <h2 className="mb-4 font-semibold">School media preferences</h2>
        <form onSubmit={save} className="space-y-4">
          <Input id="media-cloud" label="Cloudinary cloud name" required
            value={settings.cloud_name} maxLength={80} placeholder="your-cloud-name"
            onChange={e=>setSettings(v=>({...v,cloud_name:e.target.value}))}/>
          <Input id="media-folder" label="Profile photos folder" required
            value={settings.folder} maxLength={48} placeholder="avatars"
            hint="Stored under hope-horizon/[school ID]/[folder]. Use letters, digits, - or _."
            onChange={e=>setSettings(v=>({...v,folder:e.target.value}))}/>
          <label className="flex items-center gap-3 text-sm text-slate-700">
            <input type="checkbox" className="h-4 w-4 accent-blue-600"
              checked={settings.enabled} onChange={e=>setSettings(v=>({...v,enabled:e.target.checked}))}/>
            Allow profile photo uploads
          </label>
          <div className="flex flex-wrap gap-3">
            <Button type="submit" isLoading={busy} disabled={busy}><Save className="h-4 w-4"/>Save configuration</Button>
            <Button type="button" variant="secondary" isLoading={testing} disabled={busy||testing||!configured}
              onClick={()=>void test()}><FlaskConical className="h-4 w-4"/>Test connection</Button>
          </div>
        </form>
      </Card>}
    <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
      <ShieldCheck className="h-5 w-5 shrink-0 text-brand-700"/>
      <p>Uploads pass through the authenticated server with image validation and a 3 MB limit.
        The test checks Cloudinary authentication without uploading anything.
        <Link className="ml-1 font-medium text-brand-700 underline" href="/admin/integrations">View all integration checks</Link>.</p>
    </div>
  </div>;
}
