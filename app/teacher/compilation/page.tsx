"use client";
import {useCallback,useEffect,useState} from "react";
import Link from "next/link";
import {ClipboardCheck,RefreshCw,Send} from "lucide-react";
import {Card} from "@/components/ui/Card";
import {Button} from "@/components/ui/Button";

type ClassRow={classId:string;className:string;studentCount:number;subjectCount:number;
 expected:number;submitted:number;verified:boolean;reviewedAt:string|null;batch:{status:string;decision_remarks:string|null}|null};
type Response={termId:string|null;classes:ClassRow[]};
function msg(b:unknown):string{return (b as {error?:{message?:string}})?.error?.message||"Request failed.";}
export default function ClassCompilationPage(){
  const [data,setData]=useState<Response|null>(null);
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState("");
  const [error,setError]=useState(""),[notice,setNotice]=useState("");
  const load=useCallback(async()=>{
    setLoading(true);
    try{
      const response=await fetch("/api/teacher/compilation",{cache:"no-store"});
      const body=await response.json();
      if(!response.ok)throw new Error(msg(body));
      setData(body);setError("");
    }catch(e){setError(e instanceof Error?e.message:"Could not load class readiness.");}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{void load();},[load]);
  async function compile(row:ClassRow){
    if(!data?.termId||!window.confirm(
      "Compile all submitted subject marks for "+row.className+" and submit the class to the head of school?"
    ))return;
    setBusy(row.classId);setError("");setNotice("");
    try{
      const response=await fetch("/api/teacher/compilation",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({classId:row.classId,termId:data.termId}),
      });
      const body=await response.json();
      if(!response.ok)throw new Error(msg(body));
      setNotice(body.message+" ("+body.count+" students)");await load();
    }catch(e){setError(e instanceof Error?e.message:"Compilation failed.");}
    finally{setBusy("");}
  }
  return <div className="mx-auto max-w-5xl space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-sm font-semibold text-brand-700">Stage 2: Class teacher</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">Class result compilation</h1>
        <p className="mt-1 text-sm text-slate-600">
          Each active student must have submitted marks in every assigned class subject.
        </p>
      </div>
      <Button size="sm" variant="secondary" disabled={loading||!!busy} onClick={()=>void load()}>
        <RefreshCw className="h-4 w-4"/>Refresh</Button>
    </div>
    {error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {notice&&<p role="status" className="rounded-xl bg-green-50 p-3 text-sm text-green-700">{notice}</p>}
    {loading?<Card><p className="text-sm text-slate-500">Checking subject submissions...</p></Card>:
      !data?.classes.length?<Card><p className="text-sm text-slate-500">
        You are not assigned as a class teacher. Contact your administrator.
      </p></Card>:
      <div className="grid gap-4 sm:grid-cols-2">
        {data.classes.map(row=>{
          const ready=row.expected>0&&row.submitted===row.expected;
          const blocked=row.batch?.status==="PENDING_APPROVAL"||row.batch?.status==="APPROVED";
          return <Card key={row.classId}>
            <div className="flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5 text-brand-600"/>
              <h2 className="font-semibold text-slate-900">{row.className}</h2>
            </div>
            <p className="mt-2 text-sm text-slate-600">
              {row.studentCount} students · {row.subjectCount} subjects
            </p>
            <p className="mt-2 text-sm font-semibold">
              {row.submitted} / {row.expected} subject scores submitted
            </p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar"
              aria-label={"Submission completeness for "+row.className}
              aria-valuenow={row.submitted} aria-valuemin={0} aria-valuemax={Math.max(row.expected,1)}>
              <div className="h-full bg-brand-500" style={{width:
                (row.expected?Math.min(100,Math.round(row.submitted/row.expected*100)):0)+"%"}}/>
            </div>
            <p className="mt-3 text-sm text-slate-600">
              {row.batch?.status==="APPROVED"?"Head of school approved the class."
                :row.batch?.status==="PENDING_APPROVAL"?"Awaiting head-of-school approval."
                :row.batch?.status==="RETURNED"?"Returned for corrections. Subject teachers must resubmit their marks."
                :ready&&row.verified?"All subjects submitted and class teacher sign-off recorded."
                :ready?"All subject marks submitted. Open the score matrix to review and sign off."
                :"Subject submissions are still incomplete."}
            </p>
            {row.batch?.decision_remarks&&<p className="mt-2 rounded-lg bg-amber-50 p-2 text-sm text-amber-900">
              Feedback: {row.batch.decision_remarks}</p>}
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button disabled={!ready||!row.verified||blocked||!data.termId||!!busy} isLoading={busy===row.classId}
                onClick={()=>void compile(row)}><Send className="h-4 w-4"/>Compile and send</Button>
              <Link className="text-sm font-medium text-brand-700 hover:underline"
                href={"/teacher/compilation/"+row.classId}>Review score matrix</Link>
              <Link className="text-sm font-medium text-brand-700 hover:underline" href="/teacher/markbook">
                Open markbooks
              </Link>
            </div>
          </Card>;
        })}
      </div>}
    <p className="text-xs text-slate-500">
      Each compilation now requires class-teacher verification of the complete score matrix.
      Nothing is published until school-head approval and the separate publication step.
    </p>
  </div>;
}
