"use client";
import {useCallback,useEffect,useMemo,useState} from "react";
import {useParams,useRouter} from "next/navigation";
import Link from "next/link";
import {AlertTriangle,ArrowLeft,CheckCircle2,RefreshCw,Send,ShieldCheck} from "lucide-react";
import {Card} from "@/components/ui/Card";
import {Button} from "@/components/ui/Button";

type Student={id:string;full_name:string;admission_number:string};
type Subject={id:string;name:string;code:string};
type Mark={student_id:string;subject_id:string;ca:number;exam:number;status:"DRAFT"|"SUBMITTED";updated_at:string};
type Correction={id:string;subject_id:string;reason:string;requested_at:string;resolved_at:string|null};
type ReportEntry={student_id:string;attendance_present:number;attendance_absent:number;attendance_total_days:number;teacher_remarks:string};
type Review={className:string;termId:string;students:Student[];subjects:Subject[];marks:Mark[];reportEntries:ReportEntry[];
 corrections:Correction[];signoff:{reviewed_at:string;reviewed_by:string;checked_rows:number}|null;
 batch:{status:string;decision_remarks:string|null}|null};
function message(value:unknown){return (value as {error?:{message?:string}})?.error?.message||"Request failed.";}

export default function ClassReviewPage(){
 const params=useParams<{id:string}>(),router=useRouter();
 const classId=params.id;
 const [review,setReview]=useState<Review|null>(null),[loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const [correctionFor,setCorrectionFor]=useState(""),[reason,setReason]=useState("");
 const [confirmReview,setConfirmReview]=useState(false);
 const load=useCallback(async()=>{
  setLoading(true);
  try{
   const response=await fetch("/api/teacher/compilation/"+classId,{cache:"no-store"});
   const body=await response.json();
   if(!response.ok)throw new Error(message(body));
   setReview(body);setError("");setConfirmReview(false);
  }catch(e){setError(e instanceof Error?e.message:"Unable to load class score matrix.");}
  finally{setLoading(false);}
 },[classId]);
 useEffect(()=>{void load();},[load]);
 const marks=useMemo(()=>new Map((review?.marks??[]).map(m=>[m.student_id+":"+m.subject_id,m])),[review]);
 const openFlags=useMemo(()=>new Map((review?.corrections??[]).filter(f=>!f.resolved_at)
  .map(f=>[f.subject_id,f])),[review]);
 const expected=(review?.students.length??0)*(review?.subjects.length??0);
 const submitted=(review?.students??[]).reduce((count,st)=>count+(review?.subjects??[])
  .filter(sub=>marks.get(st.id+":"+sub.id)?.status==="SUBMITTED").length,0);
 const attendanceComplete=!!review && review.students.length>0 &&
  review.students.every(student=>review.reportEntries.some(entry=>entry.student_id===student.id &&
    entry.attendance_present+entry.attendance_absent===entry.attendance_total_days &&
    entry.teacher_remarks.trim().length>=3));
 const complete=expected>0&&submitted===expected&&openFlags.size===0&&attendanceComplete;
 const reviewLocked=review?.batch?.status==="PENDING_APPROVAL"||review?.batch?.status==="APPROVED";
 async function action(body:Record<string,unknown>,success:string){
  setBusy(true);setError("");setNotice("");
  try{
   const response=await fetch("/api/teacher/compilation/"+classId,{
    method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body),
   });
   const result=await response.json();
   if(!response.ok)throw new Error(message(result));
   await load();setNotice(success);setCorrectionFor("");setReason("");
   router.refresh();
  }catch(e){setError(e instanceof Error?e.message:"Review action failed.");}
  finally{setBusy(false);}
 }
 async function requestCorrection(subject:Subject){
  if(!reason.trim()||reason.trim().length<5){setError("Describe the correction in at least five characters.");return;}
  if(!window.confirm("Return "+subject.name+" marks to the subject teacher for correction?"))return;
  await action({action:"REQUEST_CORRECTION",subjectId:subject.id,reason},
   "Correction requested for "+subject.name+". Other submitted subjects remain locked.");
 }
 async function clearCorrection(request:Correction){
  await action({action:"CLEAR_CORRECTION",requestId:request.id},
   "Resubmitted subject marks verified. Correction closed.");
 }
 async function signoff(){
  if(!confirmReview){setError("Confirm that you have reviewed the complete subject-by-subject matrix.");return;}
  if(!window.confirm("Sign off this class score matrix as ready for head-of-school submission?"))return;
  await action({action:"SIGN_OFF"},"Class score matrix verified. You can now compile and send the class.");
 }
 return <div className="mx-auto max-w-[1200px] space-y-5">
  <div className="flex flex-wrap items-start justify-between gap-3">
   <div>
    <Link href="/teacher/compilation" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700">
     <ArrowLeft className="h-4 w-4"/> Back to class compilation
    </Link>
    <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-brand-700">Stage 2 · Class-teacher verification</p>
    <h1 className="mt-1 text-2xl font-semibold text-slate-900">{review?.className||"Class score matrix"}</h1>
    <p className="mt-1 text-sm text-slate-600">Check every submitted subject score for each student before you sign off.</p>
   </div>
   <Button variant="secondary" size="sm" disabled={loading||busy} onClick={()=>void load()}>
    <RefreshCw className="h-4 w-4"/>Refresh
   </Button>
  </div>
  {error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
  {notice&&<p role="status" className="rounded-xl bg-green-50 p-3 text-sm text-green-800">{notice}</p>}
  {loading?<Card><p className="text-sm text-slate-500">Loading subject scores and corrections...</p></Card>:
   !review?<Card><p className="text-sm text-red-600">Review unavailable.</p></Card>:<>
   <div className="grid gap-3 sm:grid-cols-3">
    <Card><p className="text-sm text-slate-500">Students</p><p className="mt-1 text-2xl font-semibold">{review.students.length}</p></Card>
    <Card><p className="text-sm text-slate-500">Submitted subject marks</p>
     <p className="mt-1 text-2xl font-semibold">{submitted} / {expected}</p></Card>
    <Card><p className="text-sm text-slate-500">Open corrections</p>
     <p className="mt-1 text-2xl font-semibold">{openFlags.size}</p></Card>
   </div>
   <Card className="flex flex-wrap items-center justify-between gap-3">
    <div>
     <h2 className="font-semibold">Attendance and class-teacher remarks</h2>
     <p className="mt-1 text-sm text-slate-600">
      {review.reportEntries.length} of {review.students.length} student reports recorded.
      {attendanceComplete?" Ready for class sign-off.":" Complete every pupil before signing off."}
     </p>
    </div>
    <Link href={"/teacher/compilation/"+classId+"/attendance"}
     className="rounded-xl bg-brand-500 px-4 py-2 text-sm font-semibold text-white">
     Enter attendance and remarks
    </Link>
   </Card>
   {review.batch&&<p className="rounded-xl bg-blue-50 p-4 text-sm text-blue-900">
    Batch status: <strong>{review.batch.status.replaceAll("_"," ")}</strong>.
    {review.batch.decision_remarks?" Head's feedback: "+review.batch.decision_remarks:""}
   </p>}
   <Card>
    <h2 className="mb-2 font-semibold">Subject-by-subject class matrix</h2>
    <p className="mb-4 text-xs text-slate-500">Each cell shows CA + exam = total, then its submission status. Scroll horizontally for additional subjects.</p>
    <div className="overflow-x-auto rounded-xl border border-slate-200">
     <table className="w-full min-w-[660px] border-collapse text-left text-xs">
      <thead className="bg-slate-50">
       <tr className="border-b">
        <th className="sticky left-0 z-10 min-w-[165px] border-r bg-slate-50 p-3">Student</th>
        {review.subjects.map(subject=><th key={subject.id} className="min-w-[135px] p-3">
         <span className="block font-semibold">{subject.name}</span>
         <span className="font-normal text-slate-500">{subject.code}</span>
        </th>)}
       </tr>
      </thead>
      <tbody>{review.students.map(student=><tr key={student.id} className="border-b last:border-0">
       <td className="sticky left-0 z-10 border-r bg-white p-3">
        <span className="block font-semibold text-slate-900">{student.full_name}</span>
        <span className="text-slate-500">{student.admission_number}</span>
       </td>
       {review.subjects.map(sub=>{
        const mark=marks.get(student.id+":"+sub.id);
        return <td key={sub.id} className={"p-3 align-top "+(!mark||mark.status!=="SUBMITTED"?"bg-amber-50":"")}>
         {mark?<><span className="block font-semibold text-slate-900">
           {mark.ca} + {mark.exam} = {mark.ca+mark.exam}
          </span><span className={"text-[11px] "+(mark.status==="SUBMITTED"?"text-green-700":"text-amber-700")}>
           {mark.status==="SUBMITTED"?"Submitted":"Draft, not ready"}
          </span></>:<span className="font-semibold text-amber-700">Missing</span>}
        </td>;
       })}
      </tr>)}</tbody>
     </table>
     {review.students.length===0&&<p className="p-4 text-sm text-slate-500">No active students in this class.</p>}
    </div>
   </Card>
   <Card>
    <h2 className="font-semibold">Subject verification and corrections</h2>
    <p className="mt-1 text-sm text-slate-500">Only a subject with submitted marks can be returned. Every request is logged and must be cleared after resubmission.</p>
    <div className="mt-3 divide-y divide-slate-100">
     {review.subjects.map(subject=>{
      const open=openFlags.get(subject.id);
      const count=review.students.filter(st=>marks.get(st.id+":"+subject.id)?.status==="SUBMITTED").length;
      return <div key={subject.id} className="space-y-3 py-4">
       <div className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="font-semibold text-slate-900">{subject.name}</p>
         <p className="text-xs text-slate-500">{count}/{review.students.length} students submitted</p>
         {open&&<p className="mt-1 text-sm text-amber-800">Correction: {open.reason}</p>}
        </div>
        {open?<Button size="sm" variant="secondary" disabled={busy||count!==review.students.length||reviewLocked}
          onClick={()=>void clearCorrection(open)}><CheckCircle2 className="h-4 w-4"/>Verify resubmission</Button>:
         <Button size="sm" variant="secondary" disabled={busy||count!==review.students.length||reviewLocked}
          onClick={()=>{setCorrectionFor(subject.id);setReason("");}}>
          <AlertTriangle className="h-4 w-4"/>Request correction</Button>}
       </div>
       {correctionFor===subject.id&&!open&&<div className="space-y-2 rounded-xl bg-slate-50 p-3">
        <label htmlFor={"reason-"+subject.id} className="block text-sm font-medium">Reason for correction</label>
        <textarea id={"reason-"+subject.id} maxLength={500} rows={2} value={reason}
          onChange={e=>setReason(e.target.value)} className="w-full rounded-xl border border-slate-300 p-3 text-sm"
          placeholder="E.g. Please check the Continuous Assessment score for pupil..."/>
        <div className="flex gap-2"><Button size="sm" disabled={busy||reason.trim().length<5}
          onClick={()=>void requestCorrection(subject)}>Send correction</Button>
         <Button size="sm" variant="secondary" onClick={()=>setCorrectionFor("")}>Cancel</Button></div>
       </div>}
      </div>;
     })}
    </div>
   </Card>
   <Card>
    <div className="flex items-start gap-3">
     <ShieldCheck className="mt-1 h-6 w-6 shrink-0 text-brand-700"/>
     <div className="min-w-0 flex-1">
      <h2 className="font-semibold">Final class-teacher sign-off</h2>
      <p className="mt-1 text-sm text-slate-600">
       Verify each student's marks, attendance and teacher remarks. Subsequent changes cancel sign-off.
      </p>
      {review.signoff&&<p className="mt-2 text-sm font-semibold text-green-700">
       Signed off on {new Date(review.signoff.reviewed_at).toLocaleString()}.
      </p>}
      <label className="mt-4 flex cursor-pointer items-start gap-2 text-sm text-slate-700">
       <input type="checkbox" className="mt-1 h-4 w-4" checked={confirmReview}
        disabled={!complete||reviewLocked||busy} onChange={e=>setConfirmReview(e.target.checked)}/>
       I have reviewed every student&apos;s marks, attendance and remarks, confirmed submissions and cleared correction requests.
      </label>
      <div className="mt-4 flex flex-wrap gap-3">
       <Button disabled={!complete||!confirmReview||reviewLocked||busy} isLoading={busy}
        onClick={()=>void signoff()}><CheckCircle2 className="h-4 w-4"/>Sign off class review</Button>
       <Link href="/teacher/compilation"
        className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-brand-700">
        <Send className="h-4 w-4"/>Go to compilation
       </Link>
      </div>
     </div>
    </div>
   </Card>
  </>}
 </div>;
}
