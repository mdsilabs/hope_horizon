"use client";
import {useEffect,useState,useCallback} from "react";
import {usePathname} from "next/navigation";
import {BookOpen,CheckCircle2,Printer,RefreshCw,Send,ShieldAlert,Undo2} from "lucide-react";
import {Button} from "@/components/ui/Button";
import {Card} from "@/components/ui/Card";

type Batch={id:string;class_id:string;term_id:string;status:string;
 release_state:"UNRELEASED"|"PUBLISHED"|"WITHDRAWN"|"LEGACY_MIXED";
 head_signature_name:string|null;head_signed_at:string|null;published_at:string|null;withdrawn_at:string|null;
 classes:{name:string;arm:string|null}|null;terms:{name:string}|null};
type Payload={batches:Batch[];canWithdraw:boolean};
function getError(value:unknown){return (value as {error?:{message?:string}})?.error?.message||"Request failed.";}

export function ClassReleaseBoard(){
 const isPrincipal=usePathname().startsWith("/principal");
 const [batches,setBatches]=useState<Batch[]>([]);
 const [canWithdraw,setCanWithdraw]=useState(false);
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState("");
 const [error,setError]=useState(""),[notice,setNotice]=useState("");
 const load=useCallback(async()=>{
  setLoading(true);
  try{
   const response=await fetch("/api/approval/class-releases",{cache:"no-store"});
   const body=await response.json();
   if(!response.ok)throw new Error(getError(body));
   const payload=body as Payload;
   setBatches(payload.batches);setCanWithdraw(payload.canWithdraw);setError("");
  }catch(e){setError(e instanceof Error?e.message:"Unable to load class releases.");}
  finally{setLoading(false);}
 },[]);
 useEffect(()=>{void load();},[load]);
 async function act(batch:Batch,action:"PUBLISH"|"WITHDRAW"){
  const className=(batch.classes?.name||"Class")+" "+(batch.classes?.arm||"");
  if(!window.confirm(action==="PUBLISH"?
   "Publish every approved result in "+className+"? Students and parents will see the entire class at once.":
   "Withdraw every published result in "+className+"? This action hides them all from families."))return;
  setBusy(batch.id);setError("");setNotice("");
  try{
   const response=await fetch("/api/approval/class-releases/"+batch.id,{
    method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action}),
   });
   const body=await response.json();
   if(!response.ok)throw new Error(getError(body));
   setNotice(body.message+" ("+body.count+" students)");await load();
  }catch(e){setError(e instanceof Error?e.message:"Unable to process class release.");}
  finally{setBusy("");}
 }
 return <div className="space-y-5">
  <div className="flex flex-wrap items-start justify-between gap-3">
   <div><p className="text-sm font-semibold text-brand-700">Stage 4 · School-wide release</p>
    <h1 className="mt-1 font-display text-2xl font-semibold text-slate-900">Class results publication</h1>
    <p className="mt-1 text-sm text-slate-600">Publish an entire approved class in one transaction. Individual publication is disabled for compiled classes.</p>
   </div>
   <Button size="sm" variant="secondary" disabled={loading||!!busy} onClick={()=>void load()}>
    <RefreshCw className="h-4 w-4"/> Refresh
   </Button>
  </div>
  {error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
  {notice&&<p role="status" className="rounded-xl bg-green-50 p-3 text-sm text-green-800">{notice}</p>}
  <Card>
   <div className="flex items-start gap-3">
    <ShieldAlert className="mt-1 h-5 w-5 shrink-0 text-brand-700"/>
    <p className="text-sm text-slate-600">
     The server checks head-of-school approval, the complete enrolled class, subject scores,
     attendance, remarks and electronic approval attribution. If any record is incomplete,
     no student&apos;s result is released. Gmail mass delivery is deliberately excluded from
     the publication transaction; in-app notifications are created for linked families.
    </p>
   </div>
  </Card>
  {loading?<Card><p className="text-sm text-slate-500">Loading approved classes...</p></Card>:
   batches.length===0?<Card><p className="text-sm text-slate-500">No head-approved class batches yet. Complete the class-teacher and school-head approval workflow first.</p></Card>:
   <div className="grid gap-4 sm:grid-cols-2">
    {batches.map(b=>{
     const published=b.release_state==="PUBLISHED";
     const canRelease=b.release_state==="UNRELEASED"&&!!b.head_signature_name&&!!b.head_signed_at;
     return <Card key={b.id}>
      <div className="flex items-center gap-2">
       {published?<CheckCircle2 className="h-5 w-5 text-green-600"/>:
        <BookOpen className="h-5 w-5 text-brand-700"/>}
       <h2 className="font-semibold text-slate-900">{b.classes?.name||"Class"} {b.classes?.arm||""}</h2>
      </div>
      <p className="mt-1 text-xs text-slate-500">{b.terms?.name||"Academic period"}</p>
      <p className="mt-3 text-sm font-semibold text-slate-700">
       {b.release_state==="UNRELEASED"?"Approved · Not published"
        :b.release_state==="PUBLISHED"?"Published to families"
        :b.release_state==="WITHDRAWN"?"Withdrawn · Hidden from families"
        :"Legacy partial publication · Needs manual reconciliation"}
      </p>
      {b.head_signature_name?<p className="mt-2 text-xs text-slate-600">
       Approved by {b.head_signature_name} · {b.head_signed_at?new Date(b.head_signed_at).toLocaleDateString():"date unavailable"}
      </p>:<p className="mt-2 text-xs text-amber-700">Electronic approval attribution is missing.</p>}
      {b.published_at&&<p className="mt-1 text-xs text-slate-500">
       Released {new Date(b.published_at).toLocaleString()}</p>}
      <div className="mt-4 flex flex-wrap gap-2">
       {canRelease&&<Button disabled={!!busy} isLoading={busy===b.id} onClick={()=>void act(b,"PUBLISH")}>
        <Send className="h-4 w-4"/> Publish whole class
       </Button>}
       {published&&canWithdraw&&<Button disabled={!!busy} variant="secondary"
        isLoading={busy===b.id} onClick={()=>void act(b,"WITHDRAW")}>
        <Undo2 className="h-4 w-4"/> Withdraw whole class
       </Button>}
       {(published||canRelease)&&<a
        href={(isPrincipal?"/principal/results":"/admin/results")+(isPrincipal?"":"?status="+(published?"PUBLISHED":"APPROVED"))}
        className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-brand-700">
        <Printer className="h-4 w-4"/> View student report links
       </a>}
      </div>
     </Card>;
    })}
   </div>}
 </div>;
}
