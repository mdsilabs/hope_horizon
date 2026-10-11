"use client";
import {useEffect,useState,useCallback} from "react";
import {CheckCircle2,ClipboardCheck,RefreshCw,RotateCcw} from "lucide-react";
import {Card} from "@/components/ui/Card";
import {Button} from "@/components/ui/Button";
type Batch={id:string;class_id:string;term_id:string;status:string;submitted_at:string;
 decision_remarks:string|null;classes:{name:string;arm:string|null}|null;terms:{name:string}|null};
type Score={ca:number;exam:number;total:number;grade:string|null;subjects:{name:string;code:string}|null};
type Result={id:string;student_id:string;overall_total:number|null;overall_average:number|null;
 overall_position:number|null;status:string;
 students:{full_name:string;admission_number:string}|null;result_subject_scores:Score[]};
function msg(body:unknown){return (body as {error?:{message?:string}})?.error?.message||"Request failed.";}
export function ClassApprovalBoard(){
  const [batches,setBatches]=useState<Batch[]>([]),[active,setActive]=useState("");
  const [results,setResults]=useState<Result[]>([]),[remarks,setRemarks]=useState("");
  const [loading,setLoading]=useState(true),[detailLoading,setDetailLoading]=useState(false);
  const [busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
  const reload=useCallback(async()=>{
    setLoading(true);
    try{
      const response=await fetch("/api/approval/class-batches",{cache:"no-store"});
      const body=await response.json();
      if(!response.ok)throw new Error(msg(body));
      setBatches(body.batches);setError("");
    }catch(e){setError(e instanceof Error?e.message:"Could not load class approvals.");}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{void reload();},[reload]);
  async function open(id:string){
    setActive(id);setDetailLoading(true);setResults([]);setRemarks("");setError("");setNotice("");
    try{
      const response=await fetch("/api/approval/class-batches/"+id,{cache:"no-store"});
      const body=await response.json();
      if(!response.ok)throw new Error(msg(body));
      setResults(body.results);setRemarks(body.batch.decision_remarks||"");
    }catch(e){setError(e instanceof Error?e.message:"Could not load compiled class.");}
    finally{setDetailLoading(false);}
  }
  async function decide(action:"APPROVE"|"RETURN"){
    if(!active)return;
    if(action==="RETURN"&&!remarks.trim()){setError("Explain what should be corrected.");return;}
    if(!window.confirm(action==="APPROVE"?"Approve this complete class?":"Return the entire class to subject teachers for corrections?"))return;
    setBusy(true);setError("");setNotice("");
    try{
      const response=await fetch("/api/approval/class-batches/"+active,{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({action,remarks}),
      });
      const body=await response.json();
      if(!response.ok)throw new Error(msg(body));
      setNotice(action==="APPROVE"?"Entire class approved. Publishing is a separate step."
        :"Class returned for correction. Subject markbooks have been reopened.");
      setActive("");setResults([]);await reload();
    }catch(e){setError(e instanceof Error?e.message:"Could not save decision.");}
    finally{setBusy(false);}
  }
  const selection=batches.find(b=>b.id===active);
  return <div className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-sm font-semibold text-brand-700">Stage 3: School head</p>
        <h1 className="mt-1 font-display text-2xl font-semibold text-slate-900">Class result approval</h1>
        <p className="mt-1 text-sm text-slate-600">
          Review compiled class marks as a whole before approving or returning them.
        </p>
      </div>
      <Button variant="secondary" size="sm" onClick={()=>void reload()} disabled={loading||busy}>
        <RefreshCw className="h-4 w-4"/>Refresh</Button>
    </div>
    {error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {notice&&<p role="status" className="rounded-xl bg-green-50 p-3 text-sm text-green-700">{notice}</p>}
    <div className="grid gap-4 lg:grid-cols-[290px_minmax(0,1fr)]">
      <Card>
        <h2 className="mb-3 flex items-center gap-2 font-semibold">
          <ClipboardCheck className="h-5 w-5"/>Compiled classes</h2>
        {loading?<p className="text-sm text-slate-500">Loading submitted classes...</p>:
          batches.length===0?<p className="text-sm text-slate-500">No class compilations submitted yet.</p>:
          <div className="max-h-[570px] space-y-1 overflow-y-auto">
            {batches.map(b=><button type="button" key={b.id} onClick={()=>void open(b.id)}
              className={"block w-full rounded-xl p-3 text-left text-sm "+
                (active===b.id?"bg-brand-50 text-brand-800":"hover:bg-slate-50")}>
              <span className="block font-semibold">{b.classes?.name||"Class"} {b.classes?.arm||""}</span>
              <span className="block text-xs text-slate-500">{b.terms?.name||"Term"} · {b.status.replaceAll("_"," ")}</span>
              <span className="block text-xs text-slate-400">{new Date(b.submitted_at).toLocaleDateString()}</span>
            </button>)}
          </div>}
      </Card>
      <Card>
        {!selection?<p className="text-sm text-slate-500">Choose a compiled class to review student scores and approve or return it.</p>:
          detailLoading?<p className="text-sm text-slate-500">Loading compiled scores...</p>:
          <div className="space-y-4">
            <div><h2 className="font-semibold text-slate-900">{selection.classes?.name} {selection.classes?.arm}</h2>
              <p className="text-sm text-slate-600">{selection.terms?.name} · {selection.status.replaceAll("_"," ")}</p>
            </div>
            <div className="max-h-[550px] space-y-3 overflow-y-auto">
              {results.map(row=><div key={row.id} className="rounded-xl border border-slate-200 p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div><p className="font-semibold text-slate-900">{row.students?.full_name||"Student"}</p>
                    <p className="text-xs text-slate-500">{row.students?.admission_number}</p></div>
                  <span className="text-sm font-semibold text-brand-700">
                    Avg {row.overall_average??"—"} · Position {row.overall_position??"—"}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {row.result_subject_scores.map(s=><span key={s.subjects?.code}
                    className="rounded-lg bg-slate-50 px-2 py-1 text-xs text-slate-700">
                    {s.subjects?.name}: {s.ca}+{s.exam}={s.total} ({s.grade??"—"})
                  </span>)}
                </div>
              </div>)}
            </div>
            {selection.status==="PENDING_APPROVAL"?<>
              <label className="block text-sm font-semibold text-slate-700" htmlFor="head-remarks">
                Head-of-school remarks (required if returning)
              </label>
              <textarea id="head-remarks" rows={3} maxLength={500} value={remarks}
                onChange={e=>setRemarks(e.target.value)}
                className="w-full rounded-xl border border-slate-300 p-3 text-sm"
                placeholder="Check errors or provide approval remarks"/>
              <div className="flex flex-wrap gap-3">
                <Button disabled={busy||results.length===0} isLoading={busy}
                  onClick={()=>void decide("APPROVE")}>
                  <CheckCircle2 className="h-4 w-4"/>Approve entire class
                </Button>
                <Button variant="secondary" disabled={busy||results.length===0}
                  onClick={()=>void decide("RETURN")}>
                  <RotateCcw className="h-4 w-4"/>Return for correction
                </Button>
              </div>
            </>:selection.decision_remarks?
              <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Remarks: {selection.decision_remarks}</p>:null}
          </div>}
      </Card>
    </div>
  </div>;
}
