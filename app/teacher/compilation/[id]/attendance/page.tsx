"use client";
import {useCallback,useEffect,useState} from "react";
import Link from "next/link";
import {useParams} from "next/navigation";
import {ArrowLeft,Save,RefreshCw} from "lucide-react";
import {Card} from "@/components/ui/Card";
import {Button} from "@/components/ui/Button";

type Student={id:string;full_name:string;admission_number:string};
type Row={student_id:string;attendance_present:number;attendance_absent:number;
 attendance_total_days:number;teacher_remarks:string};
type Review={className:string;students:Student[];reportEntries:Row[];
 batch:{status:string}|null};
type Input={present:string;absent:string;totalDays:string;remark:string};
function getError(b:unknown){return (b as {error?:{message?:string}})?.error?.message||"Request failed.";}

export default function ClassAttendancePage(){
 const params=useParams<{id:string}>(),classId=params.id;
 const [data,setData]=useState<Review|null>(null),[rows,setRows]=useState<Record<string,Input>>({});
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
 const [error,setError]=useState(""),[notice,setNotice]=useState("");
 const load=useCallback(async()=>{
  setLoading(true);
  try{
   const response=await fetch("/api/teacher/compilation/"+classId,{cache:"no-store"});
   const body=await response.json();
   if(!response.ok)throw new Error(getError(body));
   const review=body as Review;
   setData(review);
   const saved=new Map(review.reportEntries.map(x=>[x.student_id,x]));
   setRows(Object.fromEntries(review.students.map(s=>{
    const x=saved.get(s.id);
    return [s.id,{present:x?String(x.attendance_present):"",
     absent:x?String(x.attendance_absent):"",totalDays:x?String(x.attendance_total_days):"",
     remark:x?.teacher_remarks||""}];
   })));
   setError("");
  }catch(e){setError(e instanceof Error?e.message:"Unable to load class attendance.");}
  finally{setLoading(false);}
 },[classId]);
 useEffect(()=>{void load();},[load]);
 function update(id:string,key:keyof Input,value:string){
  setRows(prev=>({...prev,[id]:{...prev[id],[key]:value}}));
 }
 async function save(){
  if(!data||!data.students.length)return;
  const entries=data.students.map(s=>{
   const x=rows[s.id];
   return {studentId:s.id,present:Number(x?.present),absent:Number(x?.absent),
    totalDays:Number(x?.totalDays),remark:x?.remark?.trim()||""};
  });
  if(data.students.some(s=>!rows[s.id]||["present","absent","totalDays"].some(k=>
   rows[s.id][k as "present"|"absent"|"totalDays"]===""))){
   setError("Enter attendance figures for every enrolled student.");return;
  }
  if(entries.some(x=>x.totalDays<1||x.totalDays>366||x.present<0||x.absent<0||
   x.present+x.absent!==x.totalDays||x.remark.length<3||x.remark.length>500)){
   setError("Attendance must add up, and each teacher remark must be 3–500 characters.");return;
  }
  setBusy(true);setError("");setNotice("");
  try{
   const response=await fetch("/api/teacher/compilation/"+classId+"/report",{
    method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({entries}),
   });
   const body=await response.json();
   if(!response.ok)throw new Error(getError(body));
   setNotice(body.message);
  }catch(e){setError(e instanceof Error?e.message:"Could not save attendance.");}
  finally{setBusy(false);}
 }
 const blocked=data?.batch?.status==="PENDING_APPROVAL"||data?.batch?.status==="APPROVED";
 return <div className="mx-auto max-w-5xl space-y-5">
  <div><Link href={"/teacher/compilation/"+classId} className="inline-flex items-center gap-2 text-sm font-semibold text-brand-700">
   <ArrowLeft className="h-4 w-4"/> Return to score review</Link>
   <h1 className="mt-3 font-display text-2xl font-semibold text-slate-900">Attendance and class-teacher remarks</h1>
   <p className="mt-1 text-sm text-slate-600">{data?.className||"Class"} · Complete every pupil before final sign-off.</p>
  </div>
  {error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
  {notice&&<p role="status" className="rounded-xl bg-green-50 p-3 text-sm text-green-800">{notice}</p>}
  {loading?<Card><p className="text-sm text-slate-500">Loading attendance...</p></Card>:!data?
   <Card>Class record unavailable.</Card>:<Card>
    {blocked&&<p className="mb-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
     Class is already submitted to the school head. Attendance is locked.</p>}
    <div className="mb-3 flex items-center justify-between gap-2">
     <h2 className="font-semibold">Enrolled pupils ({data.students.length})</h2>
     <Button variant="secondary" size="sm" disabled={busy} onClick={()=>void load()}>
      <RefreshCw className="h-4 w-4"/> Refresh</Button>
    </div>
    <div className="overflow-x-auto">
     <table className="min-w-[850px] w-full border-collapse text-left text-sm">
      <thead><tr className="border-b bg-slate-50 text-slate-600">
       <th className="p-3">Student</th><th className="p-3">Present</th><th className="p-3">Absent</th>
       <th className="p-3">School days</th><th className="min-w-[260px] p-3">Teacher remark</th></tr></thead>
      <tbody className="divide-y divide-slate-100">
       {data.students.map(student=>{
        const x=rows[student.id]||{present:"",absent:"",totalDays:"",remark:""};
        return <tr key={student.id}>
         <td className="p-3 font-medium">{student.full_name}
          <span className="block text-xs text-slate-500">{student.admission_number}</span></td>
         {(["present","absent","totalDays"] as const).map(key=><td key={key} className="p-2">
          <input aria-label={key+" for "+student.full_name} type="number" min={key==="totalDays"?1:0}
           max={366} step={1} disabled={blocked||busy} value={x[key]}
           onChange={e=>update(student.id,key,e.target.value)}
           className="w-24 rounded-lg border border-slate-300 p-2"/></td>)}
         <td className="p-2"><textarea aria-label={"Teacher remark for "+student.full_name}
          disabled={blocked||busy} maxLength={500} rows={2} value={x.remark}
          onChange={e=>update(student.id,"remark",e.target.value)}
          className="w-full rounded-lg border border-slate-300 p-2 text-sm"
          placeholder="Progress, strengths and guidance"/></td>
        </tr>;
       })}
      </tbody>
     </table>
    </div>
    <div className="mt-4 flex flex-wrap gap-3">
     <Button disabled={blocked||busy||!data.students.length} isLoading={busy} onClick={()=>void save()}>
      <Save className="h-4 w-4"/> Save class attendance and remarks</Button>
     <Link href={"/teacher/compilation/"+classId}
      className="inline-flex items-center rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-brand-700">
      Review score matrix
     </Link>
    </div>
   </Card>}
 </div>;
}
