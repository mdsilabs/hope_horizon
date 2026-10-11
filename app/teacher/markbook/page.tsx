"use client";
import {useEffect,useState,useCallback} from "react";
import Link from "next/link";
import {BookOpen,RefreshCw,Save,Send} from "lucide-react";
import {Card} from "@/components/ui/Card";
import {Button} from "@/components/ui/Button";
import {Select} from "@/components/ui/Select";
type Assignment={classId:string;subjectId:string;className:string;subjectName:string;subjectCode:string;caMax:number;examMax:number};
type Student={id:string;full_name:string;admission_number:string};
type Mark={student_id:string;ca:number;exam:number;status:"DRAFT"|"SUBMITTED"};
type Data={termId:string|null;assignments:Assignment[];students:Student[];marks:Mark[]};
type Score={ca:string;exam:string};
function msg(value:unknown):string{return (value as {error?:{message?:string}})?.error?.message||"Request failed.";}
export default function SubjectMarkbookPage(){
  const [data,setData]=useState<Data|null>(null),[selection,setSelection]=useState("");
  const [values,setValues]=useState<Record<string,Score>>({});
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
  const [error,setError]=useState(""),[notice,setNotice]=useState("");
  const active=data?.assignments.find(a=>a.classId+":"+a.subjectId===selection);
  const locked=data?.marks.some(m=>m.status==="SUBMITTED")??false;
  const load=useCallback(async(key:string)=>{
    setLoading(true);
    try{
      const q=new URLSearchParams();
      const [classId,subjectId]=key.split(":");
      if(classId&&subjectId){q.set("classId",classId);q.set("subjectId",subjectId);}
      const response=await fetch("/api/teacher/markbook?"+q,{cache:"no-store"});
      const body=await response.json();
      if(!response.ok)throw new Error(msg(body));
      const result=body as Data;
      setData(result);
      const selected=key||((result.assignments[0]?.classId||"")+":"+(result.assignments[0]?.subjectId||""));
      if(!key && result.assignments.length)setSelection(selected);
      if(key){
        const existing=Object.fromEntries(result.marks.map(mark=>[mark.student_id,
          {ca:String(mark.ca),exam:String(mark.exam)}]));
        setValues(existing);
      }
      setError("");
    }catch(e){setError(e instanceof Error?e.message:"Could not open your subject markbook.");}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{void load("");},[load]);
  useEffect(()=>{if(selection)void load(selection);},[selection,load]);
  function update(id:string,kind:"ca"|"exam",value:string){
    setValues(previous=>({...previous,[id]:{...previous[id],[kind]:value}}));
  }
  async function save(submit:boolean){
    if(!data?.termId||!active)return;
    const rows=(data.students||[]).map(s=>({
      studentId:s.id,ca:Number(values[s.id]?.ca),exam:Number(values[s.id]?.exam),
    }));
    if(rows.length===0){setError("No active students were found for this class.");return;}
    if(data.students.some(s=>values[s.id]?.ca==null||values[s.id]?.ca===""||
       values[s.id]?.exam==null||values[s.id]?.exam==="")){
      setError("Enter both CA and exam marks for every enrolled student before saving.");return;
    }
    if(rows.some(x=>!Number.isFinite(x.ca)||!Number.isFinite(x.exam)||
      x.ca<0||x.exam<0||x.ca>active.caMax||x.exam>active.examMax)){
      setError("Some marks are outside this subject's CA or exam score limits.");return;
    }
    if(submit&&!window.confirm("Submit this complete subject markbook to the class teacher? Editing is locked until a class compilation is returned."))return;
    setBusy(true);setError("");setNotice("");
    try{
      const res=await fetch("/api/teacher/markbook",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({classId:active.classId,subjectId:active.subjectId,
          termId:data.termId,submit,scores:rows})});
      const body=await res.json();
      if(!res.ok)throw new Error(msg(body));
      setNotice(submit?"Subject marks submitted to the class teacher.":"Subject markbook saved as draft.");
      await load(selection);
    }catch(e){setError(e instanceof Error?e.message:"Could not save subject marks.");}
    finally{setBusy(false);}
  }
  return <div className="mx-auto max-w-5xl space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-sm font-semibold text-brand-700">Stage 1: Subject teacher</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">Subject markbook</h1>
        <p className="mt-1 text-sm text-slate-600">Record CA and exam marks for every student in one assigned subject.</p>
      </div>
      <Button variant="secondary" size="sm" disabled={loading||busy}
        onClick={()=>void load(selection)}><RefreshCw className="h-4 w-4"/>Refresh</Button>
    </div>
    {error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {notice&&<p role="status" className="rounded-xl bg-green-50 p-3 text-sm text-green-800">{notice}</p>}
    <Card>
      <div className="grid items-end gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
        <Select label="Class and subject" value={selection}
          options={(data?.assignments||[]).map(a=>({value:a.classId+":"+a.subjectId,
            label:a.className+" | "+a.subjectName+" ("+a.subjectCode+")"}))}
          onChange={e=>setSelection(e.target.value)} placeholder="Select your assignment"/>
        <Link href="/teacher/compilation"
          className="inline-flex items-center justify-center rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium text-brand-700 hover:bg-brand-50">
          Class compilation
        </Link>
      </div>
      {!data?.termId?<p className="mt-4 text-sm text-amber-700">Ask the administrator to activate the current term.</p>:null}
      {active?<p className="mt-3 text-sm text-slate-500">Maximum: CA {active.caMax}, examination {active.examMax}.
        {locked?<span className="ml-2 font-semibold text-green-700">Submitted and locked</span>:null}
      </p>:null}
    </Card>
    {loading?<Card><p className="text-sm text-slate-600">Loading markbook...</p></Card>:
      !active?<Card><div className="flex items-center gap-2 text-sm text-slate-600">
        <BookOpen className="h-5 w-5"/>No assigned subjects yet. Ask your school administrator to assign classes and subjects.</div></Card>:
      <Card>
        <div className="overflow-x-auto">
          <table className="min-w-[620px] w-full border-collapse text-left text-sm">
            <thead><tr className="border-b text-slate-500">
              <th className="p-3">Student</th><th className="p-3">Admission no.</th>
              <th className="p-3">CA / {active.caMax}</th><th className="p-3">Exam / {active.examMax}</th>
              <th className="p-3">Total</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {data?.students.map(student=>{
                const score=values[student.id]||{ca:"",exam:""};
                return <tr key={student.id}>
                  <td className="p-3 font-medium text-slate-800">{student.full_name}</td>
                  <td className="p-3 text-slate-500">{student.admission_number}</td>
                  {(["ca","exam"] as const).map(k=><td key={k} className="p-2">
                    <input aria-label={k+" score for "+student.full_name} type="number" step="0.5" min="0"
                      max={k==="ca"?active.caMax:active.examMax} value={score[k]}
                      disabled={busy||locked} onChange={e=>update(student.id,k,e.target.value)}
                      className="w-24 rounded-lg border border-slate-300 px-2 py-2 focus:outline-brand-500"/>
                  </td>)}
                  <td className="p-3 font-semibold">{score.ca!==""&&score.exam!==""?
                    Number(score.ca)+Number(score.exam):"—"}</td>
                </tr>;
              })}
            </tbody>
          </table>
          {(data?.students.length??0)===0&&<p className="p-4 text-sm text-slate-500">No students in this class.</p>}
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button variant="secondary" disabled={busy||locked||!data?.termId||!data?.students.length}
            onClick={()=>void save(false)} isLoading={busy}><Save className="h-4 w-4"/>Save draft</Button>
          <Button disabled={busy||locked||!data?.termId||!data?.students.length}
            onClick={()=>void save(true)}><Send className="h-4 w-4"/>Submit subject marks</Button>
        </div>
      </Card>}
  </div>;
}
