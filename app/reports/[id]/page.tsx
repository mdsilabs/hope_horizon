import {notFound,redirect} from "next/navigation";
import Link from "next/link";
import QRCode from "qrcode";
import {getCurrentSession} from "@/lib/auth/getCurrentSession";
import {createClient} from "@/lib/supabase/server";
import {PrintReportButton} from "@/components/results/PrintReportButton";

export const dynamic="force-dynamic";

type Score={ca:number;exam:number;total:number;grade:string|null;
 subjects:{name:string;code:string}|null};
type Result={id:string;school_id:string;class_id:string;term_id:string;
 status:string;overall_total:number|null;overall_average:number|null;overall_position:number|null;
 attendance_present:number|null;attendance_absent:number|null;attendance_total_days:number|null;
 teacher_remarks:string|null;principal_remarks:string|null;approved_at:string|null;
 published_at:string|null;qr_verification_code:string|null;
 students:{full_name:string;admission_number:string;passport_url:string|null}|null;
 classes:{name:string;arm:string|null}|null;terms:{name:string}|null;
 academic_sessions:{name:string}|null;result_subject_scores:Score[]};

function date(value:string|null|undefined){
 return value?new Date(value).toLocaleDateString("en-NG",{day:"numeric",month:"long",year:"numeric"}):"Not recorded";
}
export default async function PrintableReport({params}:{params:Promise<{id:string}>}){
 const session=await getCurrentSession();
 if(!session)redirect("/login");
 if(!["ADMIN","PRINCIPAL","STUDENT","PARENT"].includes(session.profile.role))notFound();
 const {id}=await params;
 if(!/^[0-9a-f-]{36}$/i.test(id))notFound();
 const db=await createClient();
 // RLS prevents a student or parent from loading another family's report.
 const {data,error}=await db.from("results").select(
  "id,school_id,class_id,term_id,status,overall_total,overall_average,overall_position,"+
  "attendance_present,attendance_absent,attendance_total_days,teacher_remarks,principal_remarks,"+
  "approved_at,published_at,qr_verification_code,students(full_name,admission_number,passport_url),"+
  "classes(name,arm),terms(name),academic_sessions(name),"+
  "result_subject_scores(ca,exam,total,grade,subjects(name,code))"
 ).eq("id",id).eq("school_id",session.profile.school_id).maybeSingle();
 if(error||!data)notFound();
 const result=data as unknown as Result;
 const publicRole=["STUDENT","PARENT"].includes(session.profile.role);
 if(publicRole&&result.status!=="PUBLISHED")notFound();
 if(!publicRole&&!["APPROVED","PUBLISHED","HIDDEN"].includes(result.status))notFound();
 const [{data:school},{data:batch}]=await Promise.all([
  db.from("schools").select("name,logo_url,address,contact_phone,contact_email,show_average_on_result,show_position_on_result")
   .eq("id",session.profile.school_id).single(),
  db.from("class_result_batches").select("release_state,head_signature_name,head_signed_at,decided_by")
   .eq("school_id",session.profile.school_id).eq("class_id",result.class_id)
   .eq("term_id",result.term_id).maybeSingle(),
 ]);
 if(!school)notFound();
 if(publicRole&&batch&&batch.release_state!=="PUBLISHED")notFound();
 const preview=result.status!=="PUBLISHED";
 const printableQr=!!result.qr_verification_code&&!preview;
 let qrUrl:string|null=null,qrImage:string|null=null;
 if(printableQr){
  const origin=process.env.NEXT_PUBLIC_APP_URL;
  try{
   const u=origin?new URL(origin):null;
   if(u&&u.protocol==="https:"&&!u.username&&!u.password){
    qrUrl=new URL("/result-verification?code="+encodeURIComponent(result.qr_verification_code!),u).toString();
    qrImage=await QRCode.toDataURL(qrUrl,{margin:1,width:155});
   }
  }catch{qrUrl=null;qrImage=null;}
 }
 const scores=[...result.result_subject_scores].sort((a,b)=>
  (a.subjects?.name||"").localeCompare(b.subjects?.name||""));
 const approver=batch?.head_signature_name||null;
 return <main className="min-h-screen bg-slate-100 px-3 py-8 text-slate-900 print:bg-white print:p-0">
  <div className="mx-auto mb-4 flex max-w-[210mm] flex-wrap items-center justify-between gap-3 print:hidden">
   <Link href={session.profile.role==="STUDENT"?"/student/results":
    session.profile.role==="PARENT"?"/parent/results":session.profile.role==="PRINCIPAL"?"/principal/results":"/admin/results"}
    className="text-sm font-medium text-brand-700 hover:underline">← Back to results</Link>
   <PrintReportButton/>
  </div>
  <article className="relative mx-auto max-w-[210mm] bg-white p-6 shadow-lg sm:p-10 print:m-0 print:max-w-none print:p-[12mm] print:shadow-none">
   {preview&&<div className="mb-5 border-2 border-amber-400 bg-amber-50 p-2 text-center text-sm font-bold text-amber-800 print:border-amber-400">
    PREVIEW ONLY · NOT RELEASED TO FAMILIES
   </div>}
   <header className="border-b-2 border-slate-900 pb-5 text-center">
    <div className="flex items-center justify-center gap-4">
     {school.logo_url&&<img src={school.logo_url} alt="School logo"
       className="h-16 w-16 object-contain"/>}
     <div>
      <h1 className="font-display text-2xl font-bold uppercase tracking-wide">{school.name}</h1>
      {school.address&&<p className="mt-1 text-xs">{school.address}</p>}
      <p className="mt-1 text-xs">{[school.contact_phone,school.contact_email].filter(Boolean).join(" · ")}</p>
     </div>
    </div>
    <h2 className="mt-4 text-base font-bold uppercase tracking-[0.12em]">Student Academic Report</h2>
    <p className="mt-1 text-sm">{result.academic_sessions?.name||"Academic session"} · {result.terms?.name||"Term"}</p>
   </header>
   <section className="grid grid-cols-2 gap-x-5 gap-y-2 border-b border-slate-200 py-5 text-sm">
    <div><span className="text-slate-500">Student:</span> <strong>{result.students?.full_name||"Unknown"}</strong></div>
    <div><span className="text-slate-500">Admission no.:</span> <strong>{result.students?.admission_number||"—"}</strong></div>
    <div><span className="text-slate-500">Class:</span> <strong>{result.classes?.name} {result.classes?.arm||""}</strong></div>
    <div><span className="text-slate-500">Date approved:</span> <strong>{date(result.approved_at)}</strong></div>
   </section>
   <section className="py-5">
    <h3 className="mb-3 text-sm font-bold uppercase tracking-wide">Academic Performance</h3>
    <table className="w-full border-collapse text-left text-xs sm:text-sm">
     <thead><tr className="bg-slate-100 print:bg-slate-100">
      <th className="border border-slate-300 p-2">Subject</th>
      <th className="border border-slate-300 p-2 text-center">CA</th>
      <th className="border border-slate-300 p-2 text-center">Exam</th>
      <th className="border border-slate-300 p-2 text-center">Total</th>
      <th className="border border-slate-300 p-2 text-center">Grade</th>
     </tr></thead>
     <tbody>{scores.map((score,i)=><tr key={i} className="break-inside-avoid">
      <td className="border border-slate-300 p-2">{score.subjects?.name||"Subject"}</td>
      <td className="border border-slate-300 p-2 text-center">{score.ca}</td>
      <td className="border border-slate-300 p-2 text-center">{score.exam}</td>
      <td className="border border-slate-300 p-2 text-center font-semibold">{score.total}</td>
      <td className="border border-slate-300 p-2 text-center">{score.grade||"—"}</td>
     </tr>)}</tbody>
    </table>
    <div className="mt-3 flex flex-wrap justify-between gap-4 rounded-lg bg-slate-50 p-3 text-sm print:border print:bg-white">
     <p>Overall total: <strong>{result.overall_total??"—"}</strong></p>
     {school.show_average_on_result&&<p>Average: <strong>{result.overall_average??"—"}</strong></p>}
     {school.show_position_on_result&&<p>Class position: <strong>{result.overall_position??"—"}</strong></p>}
    </div>
   </section>
   <section className="grid gap-4 border-t border-slate-200 py-5 sm:grid-cols-2">
    <div>
     <h3 className="mb-2 text-sm font-bold uppercase tracking-wide">Attendance</h3>
     <dl className="space-y-1 text-sm">
      <div className="flex justify-between"><dt>Present</dt><dd>{result.attendance_present??"Not recorded"}</dd></div>
      <div className="flex justify-between"><dt>Absent</dt><dd>{result.attendance_absent??"Not recorded"}</dd></div>
      <div className="flex justify-between border-t pt-1"><dt>Total school days</dt>
       <dd className="font-semibold">{result.attendance_total_days??"Not recorded"}</dd></div>
     </dl>
    </div>
    <div><h3 className="mb-2 text-sm font-bold uppercase tracking-wide">Class Teacher&apos;s Remark</h3>
     <p className="min-h-16 text-sm leading-relaxed">{result.teacher_remarks||"No remark recorded."}</p></div>
   </section>
   <section className="grid gap-5 border-t border-slate-200 py-5 sm:grid-cols-2">
    <div><h3 className="mb-2 text-sm font-bold uppercase tracking-wide">Head-of-School Remarks</h3>
     <p className="text-sm leading-relaxed">{result.principal_remarks||"Approved."}</p>
    </div>
    <div><h3 className="mb-2 text-sm font-bold uppercase tracking-wide">Electronic Approval / Signature</h3>
     <p className="font-semibold">{approver||"No verified electronic signature on record"}</p>
     <p className="mt-1 text-xs text-slate-500">
      {approver?"Electronically approved by the authorized school officer.":"Signature verification unavailable for this historical report."}
     </p>
     <p className="mt-1 text-sm">Date: {date(batch?.head_signed_at||result.approved_at)}</p>
    </div>
   </section>
   <footer className="flex flex-wrap items-end justify-between gap-5 border-t border-slate-200 pt-4 text-xs text-slate-500">
    <div><p>Result status: <strong>{result.status}</strong></p>
     <p>Published: {date(result.published_at)}</p>
     {qrUrl&&<p className="mt-1 max-w-[330px] break-all">Verify: {qrUrl}</p>}
    </div>
    {qrImage&&<div className="text-center"><img src={qrImage} alt="Scannable result verification QR" className="mx-auto h-24 w-24"/>
     <p className="mt-1">Scan to verify</p></div>}
   </footer>
  </article>
  <style>{`@page{size:A4; margin:12mm}
   @media print{html,body{background:white!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}
     article{break-inside:auto}table{break-inside:auto}tr{break-inside:avoid}}
  `}</style>
 </main>;
}
