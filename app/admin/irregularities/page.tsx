"use client";
import {useCallback,useEffect,useState} from "react";
import Link from "next/link";
import {ClipboardList,RefreshCw,ShieldCheck} from "lucide-react";
import {Card} from "@/components/ui/Card";
import {Button} from "@/components/ui/Button";
type Req={
  id:string;kind:"ADD_STUDENT"|"EDIT_MARK";
  status:string;className:string;requesterName:string;classTeacherName:string;
  reason:string;payload:Record<string,unknown>;created_at:string;
  class_review_note:string|null;admin_decision_note:string|null;
};
function msg(value:unknown):string{
 return (value as {error?:{message?:string}})?.error?.message??"Request failed.";
}
const status:Record<string,string>={
  PENDING_CLASS_TEACHER:"Waiting for class teacher",
  PENDING_ADMIN:"Awaiting administrator review",
  APPROVED_PENDING_APPLICATION:"Approved, awaiting implementation",
  REJECTED_CLASS_TEACHER:"Declined by class teacher",
  REJECTED_ADMIN:"Declined by administrator",
};
export default function AdministratorIrregularitiesPage(){
 const [rows,setRows]=useState<Req[]>([]),[loading,setLoading]=useState(true),[busy,setBusy]=useState("");
 const [error,setError]=useState(""),[notice,setNotice]=useState("");
 const [notes,setNotes]=useState<Record<string,string>>({});
 const [show,setShow]=useState("pending");
 const load=useCallback(async()=>{
   setLoading(true);
   try{
     const response=await fetch("/api/admin/irregularities",{cache:"no-store"});
     const body=await response.json();
     if(!response.ok)throw new Error(msg(body));
     setRows(body.requests??[]);setError("");
   }catch(e){setError(e instanceof Error?e.message:"Could not load requests.");}
   finally{setLoading(false);}
 },[]);
 useEffect(()=>{void load();},[load]);
 async function decide(r:Req,action:"APPROVE"|"REJECT"){
   const note=(notes[r.id]??"").trim();
   if(action==="REJECT"&&note.length<10){setError("Explain why the request is rejected in at least ten characters.");return;}
   const warning=action==="APPROVE"
     ?"Approve this request for authorized application? This will NOT change published marks or enroll a student automatically."
     :"Reject this request and notify the teachers?";
   if(!window.confirm(warning))return;
   setBusy(r.id);setError("");setNotice("");
   try{
     const response=await fetch("/api/admin/irregularities/"+r.id+"/decision",{
       method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,note}),
     });
     const body=await response.json();
     if(!response.ok)throw new Error(msg(body));
     setNotice(body.message);await load();
   }catch(e){setError(e instanceof Error?e.message:"Unable to save decision.");}
   finally{setBusy("");}
 }
 const filtered=rows.filter(r=>show==="all" ||(show==="pending"
   ?r.status==="PENDING_ADMIN":r.status==="APPROVED_PENDING_APPLICATION"));
 return <div className="mx-auto max-w-5xl space-y-6">
   <div className="flex flex-wrap items-start justify-between gap-3">
     <div>
       <h1 className="flex items-center gap-2 font-display text-2xl font-semibold text-slate-900">
         <ClipboardList className="h-6 w-6"/> Class irregularity requests
       </h1>
       <p className="mt-1 text-sm text-slate-600">
         Verify class-teacher referrals and decide whether proposed student additions or mark corrections can proceed.
       </p>
     </div>
     <Button variant="secondary" size="sm" disabled={loading||!!busy} onClick={()=>void load()}>
       <RefreshCw className="h-4 w-4"/>Refresh
     </Button>
   </div>
   <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
     <strong>Published results stay locked.</strong> An approved request is permission to begin a separate
     verified amendment, not proof that marks or student records have already been changed.
     Coordinate execution through the existing student and school-head result workflows.
   </p>
   {error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
   {notice&&<p role="status" className="rounded-xl bg-green-50 p-3 text-sm text-green-800">{notice}</p>}
   <Card className="flex flex-wrap items-center justify-between gap-3">
     <div>
       <p className="font-semibold text-slate-900">Requests by stage</p>
       <p className="text-sm text-slate-500">{rows.filter(r=>r.status==="PENDING_ADMIN").length} awaiting administrator review ·
         {" "}{rows.filter(r=>r.status==="APPROVED_PENDING_APPLICATION").length} approved but not applied</p>
     </div>
     <label className="text-sm font-semibold">Show
       <select className="ml-2 rounded-lg border px-3 py-2" value={show} onChange={e=>setShow(e.target.value)}>
         <option value="pending">Pending administrator review</option>
         <option value="approved">Approved, awaiting implementation</option>
         <option value="all">All requests</option>
       </select>
     </label>
   </Card>
   {loading?<Card><p className="text-sm text-slate-600">Loading requests…</p></Card>:
     !filtered.length?<Card><p className="text-sm text-slate-500">No requests at this stage.</p></Card>:
     <div className="space-y-4">
       {filtered.map(r=><Card key={r.id} className="space-y-3">
         <div className="flex flex-wrap items-start justify-between gap-3">
           <div>
             <p className="font-semibold text-slate-900">
               {r.kind==="ADD_STUDENT"?"Add missing student":"Correct subject marks"} · {r.className}
             </p>
             <p className="mt-1 text-xs text-slate-500">
               {new Date(r.created_at).toLocaleString("en-NG")} · Request {r.id}
             </p>
           </div>
           <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold">
             {status[r.status]??r.status}
           </span>
         </div>
         <p className="text-sm text-slate-700">
           <strong>Requested by:</strong> {r.requesterName} ·
           {" "}<strong>Class teacher:</strong> {r.classTeacherName}
         </p>
         {r.kind==="ADD_STUDENT"?
           <p className="text-sm text-slate-700">
             <strong>Student:</strong> {String(r.payload.fullName??"")} ·
             {" "}<strong>Admission no.:</strong> {String(r.payload.admissionNumber??"")}
           </p>:
           <p className="text-sm text-slate-700">
             <strong>Proposed scores:</strong> CA {String(r.payload.ca??"")} · Exam {String(r.payload.exam??"")}
             <span className="ml-2 text-xs text-slate-500">Check the linked student/subject identifiers in the request record before implementation.</span>
           </p>}
         <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700"><strong>Reason:</strong> {r.reason}</p>
         {r.class_review_note&&<p className="text-sm text-slate-600">
           <strong>Class-teacher notes:</strong> {r.class_review_note}
         </p>}
         {r.admin_decision_note&&<p className="text-sm text-slate-600">
           <strong>Administrative decision:</strong> {r.admin_decision_note}
         </p>}
         {r.status==="PENDING_ADMIN"&&<div className="space-y-2 border-t pt-3">
           <label className="block text-sm font-medium" htmlFor={"note-"+r.id}>Decision notes</label>
           <textarea id={"note-"+r.id} rows={2} maxLength={1000}
             value={notes[r.id]??""} onChange={e=>setNotes(s=>({...s,[r.id]:e.target.value}))}
             className="w-full rounded-xl border border-slate-300 p-3 text-sm"
             placeholder="Reason for decision; explain if corrections or evidence are required"/>
           <div className="flex flex-wrap gap-2">
             <Button disabled={!!busy} onClick={()=>void decide(r,"APPROVE")}>
               <ShieldCheck className="h-4 w-4"/> Approve for controlled action
             </Button>
             <Button disabled={!!busy} variant="secondary" onClick={()=>void decide(r,"REJECT")}>Reject</Button>
           </div>
         </div>}
         {r.status==="APPROVED_PENDING_APPLICATION"&&
           <div className="border-t pt-3 text-sm text-amber-900">
             Pending authorized implementation. For enrollment, use
             <Link href="/admin/students" className="mx-1 font-medium underline">Student Management</Link>.
             For previously published mark corrections, preserve the original records and conduct
             a controlled amendment and school-head reapproval before republishing.
           </div>}
       </Card>)}
     </div>}
 </div>;
}
