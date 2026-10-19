"use client";
import {useCallback,useEffect,useMemo,useState,type FormEvent} from "react";
import Link from "next/link";
import {AlertTriangle,ArrowRight,ClipboardList,RefreshCw,Send} from "lucide-react";
import {Card} from "@/components/ui/Card";
import {Button} from "@/components/ui/Button";
import {submitIrregularitySchema,classIrregularityDecisionSchema,
  parseScoreInput,validateScoreLimits} from "@/lib/validations/irregularities";

type RequestKind="ADD_STUDENT"|"EDIT_MARK";
type Status="PENDING_CLASS_TEACHER"|"PENDING_ADMIN"|"APPROVED_PENDING_APPLICATION"|
  "REJECTED_CLASS_TEACHER"|"REJECTED_ADMIN";
type ClassItem={id:string;name:string;classTeacherName:string;classTeacherId:string|null;classTeacherReady:boolean;isClassTeacher:boolean};
type Term={id:string;name:string;sessionName:string};
type Student={id:string;class_id:string;full_name:string;admission_number:string};
type Subject={classId:string;subjectId:string;name:string;code:string;caMax:number;examMax:number};
type RequestRow={
  id:string;kind:RequestKind;class_id:string;term_id:string;subject_id:string|null;
  student_id:string|null;class_teacher_id:string;requester_id:string;
  classTeacherName:string;requesterName:string;payload:Record<string,unknown>;
  reason:string;status:Status;created_at:string;class_review_note:string|null;
  admin_decision_note:string|null;
};
type EventRow={id:number;request_id:string;event_type:string;note:string|null;created_at:string};
type Response={currentUserId:string;currentTermId:string|null;classes:ClassItem[];
  terms:Term[];students:Student[];subjects:Subject[];requests:RequestRow[];events:EventRow[]};
const statusNames:Record<Status,string>={
  PENDING_CLASS_TEACHER:"Waiting for class teacher",
  PENDING_ADMIN:"Waiting for administrator",
  APPROVED_PENDING_APPLICATION:"Approved · Awaiting implementation",
  REJECTED_CLASS_TEACHER:"Declined by class teacher",
  REJECTED_ADMIN:"Declined by administrator",
};
function getError(data:unknown){
  return (data as {error?:{message?:string}})?.error?.message??"Request could not be completed.";
}
export default function TeacherIrregularitiesPage(){
  const [data,setData]=useState<Response|null>(null);
  const [kind,setKind]=useState<RequestKind>("ADD_STUDENT");
  const [classId,setClassId]=useState(""),[termId,setTermId]=useState("");
  const [subjectId,setSubjectId]=useState(""),[studentId,setStudentId]=useState("");
  const [fullName,setFullName]=useState(""),[admissionNumber,setAdmissionNumber]=useState("");
  const [ca,setCa]=useState(""),[exam,setExam]=useState(""),[reason,setReason]=useState("");
  const [reviewNotes,setReviewNotes]=useState<Record<string,string>>({});
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState("");
  const [error,setError]=useState(""),[notice,setNotice]=useState("");
  const [fieldErrors,setFieldErrors]=useState<Record<string,string>>({});
  const [reviewErrors,setReviewErrors]=useState<Record<string,string>>({});
  const clearField=(key:string)=>setFieldErrors(prev=>({...prev,[key]:""}));
  const fieldError=(key:string)=>fieldErrors[key]?
    <p role="alert" className="mt-1 text-xs font-medium text-red-700">{fieldErrors[key]}</p>:null;
  const load=useCallback(async()=>{
    setLoading(true);
    try{
      const response=await fetch("/api/teacher/irregularities",{cache:"no-store"});
      const json=await response.json();
      if(!response.ok)throw new Error(getError(json));
      const next=json as Response;
      setData(next);
      setClassId(v=>{
        if(next.classes.some(c=>c.id===v))return v;
        const preferred=new URLSearchParams(window.location.search).get("classId");
        return next.classes.find(c=>c.id===preferred)?.id??next.classes[0]?.id??"";
      });
      setTermId(v=>next.terms.some(t=>t.id===v)?v:
        next.terms.find(t=>t.id===next.currentTermId)?.id??next.terms[0]?.id??"");
      setError("");
    }catch(e){setError(e instanceof Error?e.message:"Could not load irregularity requests.");}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{void load();},[load]);
  const cls=data?.classes.find(c=>c.id===classId);
  const students=useMemo(()=>(data?.students??[]).filter(s=>s.class_id===classId),[data,classId]);
  const subjects=useMemo(()=>(data?.subjects??[]).filter(s=>s.classId===classId),[data,classId]);
  // Explicit selection avoids silently submitting a correction for the
  // first student or subject when the teacher has not chosen one.
  const chosenSubject=subjectId;
  const chosenStudent=studentId;
  const selectedSubject=subjects.find(s=>s.subjectId===chosenSubject);
  async function submit(e:FormEvent<HTMLFormElement>){
    e.preventDefault();setError("");setNotice("");setFieldErrors({});
    const errors:Record<string,string>={};
    if(!cls?.classTeacherReady)
      errors.classId="Ask the administrator to assign exactly one active class teacher first.";
    if(!data?.terms.some(t=>t.id===termId))
      errors.termId="Choose a valid academic term.";
    if(kind==="EDIT_MARK"){
      if(!students.some(student=>student.id===chosenStudent))
        errors.studentId="Choose a student in the selected class.";
      if(!selectedSubject)
        errors.subjectId="Choose a subject assigned to you or your class.";
    }
    const parsedCa=parseScoreInput(ca),parsedExam=parseScoreInput(exam);
    const draft=kind==="ADD_STUDENT"?
      {kind,classId,termId,fullName,admissionNumber,reason}:
      {kind,classId,termId,studentId:chosenStudent,subjectId:chosenSubject,
        ca:parsedCa??Number.NaN,exam:parsedExam??Number.NaN,reason};
    const parsed=submitIrregularitySchema.safeParse(draft);
    if(!parsed.success){
      for(const issue of parsed.error.issues){
        const key=String(issue.path[0]??"form");
        if(!errors[key])errors[key]=issue.message;
      }
    }
    if(kind==="EDIT_MARK"){
      if(parsedCa===null)errors.ca="Enter a CA score using no more than two decimal places.";
      if(parsedExam===null)errors.exam="Enter an exam score using no more than two decimal places.";
      if(selectedSubject&&parsedCa!==null&&parsedExam!==null){
        const limitErrors=validateScoreLimits(
          parsedCa,parsedExam,selectedSubject.caMax,selectedSubject.examMax);
        if(limitErrors.ca)errors.ca=limitErrors.ca;
        if(limitErrors.exam)errors.exam=limitErrors.exam;
      }
    }
    if(Object.keys(errors).length||!parsed.success){
      setFieldErrors(errors);
      setError("Please correct the highlighted fields before submitting.");
      return;
    }
    const destination=cls!.isClassTeacher?"school administrator":cls!.classTeacherName;
    if(!window.confirm("Send this request to "+destination+"? Published results will remain unchanged."))return;
    setBusy("submit");
    try{
      const response=await fetch("/api/teacher/irregularities",{
        method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(parsed.data),
      });
      const json=await response.json();
      if(!response.ok){
        const details=(json as {error?:{details?:Record<string,string[]>}}).error?.details;
        if(details){
          const next:Record<string,string>={};
          for(const [key,values] of Object.entries(details))next[key]=values[0]??"Invalid field.";
          setFieldErrors(next);
        }
        throw new Error(getError(json));
      }
      setNotice("Request recorded. Track its progress below.");
      setFullName("");setAdmissionNumber("");setCa("");setExam("");setReason("");setFieldErrors({});
      await load();
    }catch(e){setError(e instanceof Error?e.message:"Unable to submit request.");}
    finally{setBusy("");}
  }
  async function review(row:RequestRow,action:"ENDORSE"|"REJECT"){
    const note=(reviewNotes[row.id]??"").trim();
    const checked=classIrregularityDecisionSchema.safeParse({action,note});
    if(!checked.success){
      setReviewErrors(prev=>({...prev,[row.id]:checked.error.issues[0]?.message??"Invalid review note."}));
      return;
    }
    setReviewErrors(prev=>({...prev,[row.id]:""}));
    if(!window.confirm(action==="ENDORSE"?"Forward this request to an administrator?":"Decline this request?"))return;
    setBusy(row.id);setError("");setNotice("");
    try{
      const response=await fetch("/api/teacher/irregularities/"+row.id+"/review",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify(checked.data),
      });
      const json=await response.json();
      if(!response.ok)throw new Error(getError(json));
      setNotice(json.message);await load();
    }catch(e){setError(e instanceof Error?e.message:"Review failed.");}
    finally{setBusy("");}
  }
  const myRows=(data?.requests??[]).filter(r=>r.requester_id===data?.currentUserId);
  const incoming=(data?.requests??[]).filter(r=>r.class_teacher_id===data?.currentUserId
    &&r.requester_id!==data?.currentUserId);
  const allAssigned=(data?.classes??[]).length;
  const selectedTerm=data?.terms.find(t=>t.id===termId);

  function description(row:RequestRow){
    if(row.kind==="ADD_STUDENT")
      return "Add "+String(row.payload.fullName??"Student")+
        " ("+String(row.payload.admissionNumber??"")+")";
    const st=data?.students.find(s=>s.id===row.student_id);
    const sub=data?.subjects.find(s=>s.subjectId===row.subject_id && s.classId===row.class_id);
    return "Correct "+(st?.full_name??"student")+" · "+(sub?.name??"Subject")+
      " · proposed CA "+String(row.payload.ca??"")+" / exam "+String(row.payload.exam??"");
  }
  function renderRequest(row:RequestRow,canReview:boolean){
    const cl=data?.classes.find(c=>c.id===row.class_id);
    const events=(data?.events??[]).filter(ev=>ev.request_id===row.id);
    return <Card key={row.id} className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-slate-900">{description(row)}</p>
          <p className="mt-1 text-xs text-slate-500">{cl?.name??"Assigned class"} ·
            {" "}{new Date(row.created_at).toLocaleString("en-NG")}</p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
          {statusNames[row.status]}
        </span>
      </div>
      <p className="text-sm text-slate-600">{row.reason}</p>
      <p className="text-sm text-slate-700"><strong>Assigned class teacher:</strong> {row.classTeacherName}</p>
      <p className="text-xs text-slate-500">Request reference: {row.id}</p>
      {row.class_review_note&&<p className="rounded-lg bg-slate-50 p-3 text-sm">
        <strong>Class teacher:</strong> {row.class_review_note}</p>}
      {row.admin_decision_note&&<p className="rounded-lg bg-slate-50 p-3 text-sm">
        <strong>Administrator:</strong> {row.admin_decision_note}</p>}
      {events.length>0&&<div className="border-t pt-2">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Progress history</p>
        <ol className="space-y-1">
          {events.map(ev=><li key={ev.id} className="text-xs text-slate-600">
            {ev.event_type.replaceAll("_"," ")} · {new Date(ev.created_at).toLocaleString("en-NG")}
          </li>)}
        </ol>
      </div>}
      {row.status==="APPROVED_PENDING_APPLICATION"&&<p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
        The school administrator approved the request, but the student or marks have not yet been changed.
        Publication safeguards still apply.
      </p>}
      {canReview&&row.status==="PENDING_CLASS_TEACHER"&&
        <div className="space-y-2 border-t pt-3">
          <label className="block text-sm font-semibold text-slate-700" htmlFor={"note-"+row.id}>Review notes</label>
          <textarea id={"note-"+row.id} value={reviewNotes[row.id]??""} maxLength={1000}
            aria-invalid={!!reviewErrors[row.id]}
            onChange={e=>{setReviewNotes(v=>({...v,[row.id]:e.target.value}));
              setReviewErrors(v=>({...v,[row.id]:""}));}}
            placeholder="Review the irregularity before forwarding it" rows={2}
            className={"w-full rounded-xl border p-3 text-sm "+(reviewErrors[row.id]?"border-red-500":"border-slate-300")}/>
          {reviewErrors[row.id]&&<p role="alert" className="text-xs text-red-700">{reviewErrors[row.id]}</p>}
          <p className="text-xs text-slate-500">{(reviewNotes[row.id]??"").trim().length}/1,000 characters; rejection requires at least 10.</p>
          <div className="flex flex-wrap gap-2">
            <Button disabled={!!busy} onClick={()=>void review(row,"ENDORSE")}>
              <ArrowRight className="h-4 w-4"/> Endorse to administrator
            </Button>
            <Button disabled={!!busy} variant="secondary" onClick={()=>void review(row,"REJECT")}>Decline</Button>
          </div>
        </div>}
    </Card>;
  }

  return <div className="mx-auto max-w-5xl space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="flex items-center gap-2 font-display text-2xl font-semibold text-slate-900">
          <ClipboardList className="h-6 w-6"/> Class irregularity requests
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Ask for missing-student registration or mark corrections after submission, locking or publication.
          Track each decision without unlocking published results.
        </p>
      </div>
      <Button variant="secondary" size="sm" disabled={loading||!!busy} onClick={()=>void load()}>
        <RefreshCw className="h-4 w-4"/> Refresh
      </Button>
    </div>
    {error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {notice&&<p role="status" className="rounded-xl bg-green-50 p-3 text-sm text-green-800">{notice}</p>}
    {loading&&!data?<Card><p>Loading assigned classes…</p></Card>:
      <Card className="space-y-4">
        <div>
          <h2 className="font-semibold text-slate-900">Submit a request</h2>
          <p className="mt-1 text-sm text-slate-600">
            Subject teachers send requests to the assigned class teacher. Class teachers can also report
            missing students or incorrect scores in any class subject; their own requests go straight to
            the administrator for independent review.
          </p>
        </div>
        {!allAssigned?<p className="text-sm text-amber-800">You have no assigned classes. Ask an administrator to assign you a class or subject.</p>:
        <form className="grid gap-4" onSubmit={submit} noValidate>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium">Class
              <select className="mt-1 w-full rounded-xl border p-3" value={classId}
                onChange={e=>{setClassId(e.target.value);setSubjectId("");setStudentId("");setFieldErrors({});}}>
                {data?.classes.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {fieldError("classId")}
            </label>
            <label className="text-sm font-medium">Academic term
              <select className="mt-1 w-full rounded-xl border p-3" value={termId}
                onChange={e=>{setTermId(e.target.value);clearField("termId");}}>
                {data?.terms.map(t=><option key={t.id} value={t.id}>{t.sessionName} · {t.name}</option>)}
              </select>
              {fieldError("termId")}
            </label>
          </div>
          <p className="rounded-xl bg-brand-50 p-3 text-sm text-brand-900">
            <strong>Sent to:</strong> {cls?.isClassTeacher?"School administrator":cls?.classTeacherName??"Unassigned"} ·
            {" "}{selectedTerm?.sessionName??""} {selectedTerm?.name??""}
            {cls?.classTeacherId===data?.currentUserId&&
              <span className="block text-xs">Class teacher: {cls.classTeacherName}. Your request skips self-approval and goes to the school administrator.</span>}
          </p>
          {!cls?.classTeacherReady&&<p className="flex items-center gap-2 text-sm text-amber-800">
            <AlertTriangle className="h-4 w-4"/> Contact administration to assign exactly one class teacher.</p>}
          <label className="text-sm font-medium">Request type
            <select className="mt-1 w-full rounded-xl border p-3" value={kind}
              onChange={e=>{setKind(e.target.value as RequestKind);setFieldErrors({});}}>
              <option value="ADD_STUDENT">Add missing student</option>
              <option value="EDIT_MARK">Correct student's subject marks</option>
            </select>
          </label>
          {kind==="ADD_STUDENT"?<div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium">Student's full name
              <input required minLength={2} maxLength={120} className="mt-1 w-full rounded-xl border p-3"
                value={fullName} onChange={e=>{setFullName(e.target.value);clearField("fullName");}}
                aria-invalid={!!fieldErrors.fullName}/>
              {fieldError("fullName")}
            </label>
            <label className="text-sm font-medium">Admission number
              <input required minLength={2} maxLength={50} className="mt-1 w-full rounded-xl border p-3"
                value={admissionNumber} onChange={e=>{setAdmissionNumber(e.target.value);clearField("admissionNumber");}}
                aria-invalid={!!fieldErrors.admissionNumber}/>
              {fieldError("admissionNumber")}
            </label>
          </div>:<>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-medium">Student
                <select required className="mt-1 w-full rounded-xl border p-3"
                  value={chosenStudent} onChange={e=>{setStudentId(e.target.value);clearField("studentId");}}
                  aria-invalid={!!fieldErrors.studentId}>
                  <option value="">Choose a student</option>
                  {students.map(s=><option key={s.id} value={s.id}>{s.full_name} · {s.admission_number}</option>)}
                </select>
                {fieldError("studentId")}
              </label>
              <label className="text-sm font-medium">{cls?.isClassTeacher?"Subject in my class":"My assigned subject"}
                <select required className="mt-1 w-full rounded-xl border p-3"
                  value={chosenSubject} onChange={e=>{setSubjectId(e.target.value);clearField("subjectId");}}
                  aria-invalid={!!fieldErrors.subjectId}>
                  <option value="">Choose a subject</option>
                  {subjects.map(s=><option key={s.subjectId} value={s.subjectId}>{s.name} ({s.code})</option>)}
                </select>
                {fieldError("subjectId")}
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-medium">Proposed CA score {selectedSubject?"(maximum "+selectedSubject.caMax+")":""}
                <input type="number" required min={0} max={100} step="0.01"
                  className="mt-1 w-full rounded-xl border p-3" value={ca} onChange={e=>{setCa(e.target.value);clearField("ca");}}
                  aria-invalid={!!fieldErrors.ca}/> 
                {fieldError("ca")}
              </label>
              <label className="text-sm font-medium">Proposed exam score {selectedSubject?"(maximum "+selectedSubject.examMax+")":""}
                <input type="number" required min={0} max={100} step=".5"
                  className="mt-1 w-full rounded-xl border p-3" value={exam} onChange={e=>{setExam(e.target.value);clearField("exam");}}
                  aria-invalid={!!fieldErrors.exam}/> 
                {fieldError("exam")}
              </label>
            </div>
          </>}
          <label className="text-sm font-medium">Reason for the irregularity
            <textarea required minLength={10} maxLength={1000} rows={3}
              className="mt-1 w-full rounded-xl border p-3" value={reason} aria-invalid={!!fieldErrors.reason}
              placeholder="Explain what happened, including when the issue was noticed."
              onChange={e=>{setReason(e.target.value);clearField("reason");}}/>
            {fieldError("reason")}
            <p className="mt-1 text-xs text-slate-500">{reason.trim().length}/1,000 characters. Minimum 10 characters.</p>
          </label>
          <Button type="submit" disabled={!!busy||loading||!cls?.classTeacherReady||!termId}>
            <Send className="h-4 w-4"/> Submit to {cls?.isClassTeacher?"administrator":cls?.classTeacherName??"class teacher"}
          </Button>
        </form>}
      </Card>}
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">My submitted requests ({myRows.length})</h2>
      {myRows.length?myRows.map(r=>renderRequest(r,false)):
        <Card><p className="text-sm text-slate-500">You have not submitted any requests yet.</p></Card>}
    </div>
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">Requests awaiting my class-teacher review ({incoming.filter(r=>r.status==="PENDING_CLASS_TEACHER").length})</h2>
      {incoming.length?incoming.map(r=>renderRequest(r,true)):
        <Card><p className="text-sm text-slate-500">No class-teacher requests have been assigned to you.</p></Card>}
    </div>
    <p className="text-sm text-slate-500">For changes already approved by administration,
      contact the school office for authorized implementation and renewed publication review.
      <Link href="/teacher/classes" className="ml-1 text-brand-700 underline">My classes</Link>
    </p>
  </div>;
}
