"use client";
import {useCallback,useEffect,useState,type FormEvent} from "react";
import Link from "next/link";
import {Phone,Save,RefreshCw,ShieldCheck,Users} from "lucide-react";
import {Card} from "@/components/ui/Card";
import {Button} from "@/components/ui/Button";
import {parentContactSchema} from "@/lib/validations/parent-contact";

type Account={full_name:string;email:string|null;phone:string|null;whatsapp_number:string|null};
function msg(body:unknown){return (body as {error?:{message?:string}})?.error?.message??"Unable to complete request.";}

export default function ParentAccountPage(){
  const [account,setAccount]=useState<Account|null>(null);
  const [loginEmail,setLoginEmail]=useState("");
  const [phone,setPhone]=useState("");
  const [whatsapp,setWhatsapp]=useState("");
  const [errors,setErrors]=useState<Record<string,string>>({});
  const [error,setError]=useState(""),[notice,setNotice]=useState("");
  const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
  const load=useCallback(async()=>{
    setLoading(true);
    try{
      const response=await fetch("/api/parent/account",{cache:"no-store"});
      const body=await response.json();
      if(!response.ok)throw new Error(msg(body));
      const info=body.account as Account;
      setAccount(info);setLoginEmail(body.loginEmail);
      setPhone(info.phone??"");setWhatsapp(info.whatsapp_number??"");setError("");
    }catch(e){setError(e instanceof Error?e.message:"Unable to load account.");}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{void load();},[load]);
  async function save(e:FormEvent<HTMLFormElement>){
    e.preventDefault();setErrors({});setError("");setNotice("");
    const parsed=parentContactSchema.safeParse({phone,whatsappNumber:whatsapp});
    if(!parsed.success){
      const next:Record<string,string>={};
      for(const issue of parsed.error.issues)
        next[String(issue.path[0]??"form")]=issue.message;
      setErrors(next);return;
    }
    setBusy(true);
    try{
      const response=await fetch("/api/parent/account",{
        method:"PATCH",headers:{"Content-Type":"application/json"},
        body:JSON.stringify(parsed.data),
      });
      const body=await response.json();
      if(!response.ok)throw new Error(msg(body));
      setNotice(body.message);await load();
    }catch(e){setError(e instanceof Error?e.message:"Unable to save contacts.");}
    finally{setBusy(false);}
  }
  return <div className="mx-auto max-w-3xl space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Guardian account</h1>
        <p className="mt-1 text-sm text-slate-600">
          Keep your school contact details up to date. Your children are linked by the school, not by this form.
        </p>
      </div>
      <Button variant="secondary" size="sm" disabled={busy||loading} onClick={()=>void load()}>
        <RefreshCw className="h-4 w-4"/> Refresh
      </Button>
    </div>
    {error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {notice&&<p role="status" className="rounded-xl bg-green-50 p-3 text-sm text-green-800">{notice}</p>}
    {loading?<Card>Loading guardian profile…</Card>:account&&
      <>
        <Card className="space-y-4">
          <div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-brand-700"/>
            <h2 className="font-semibold">Verified school account</h2></div>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="text-slate-500">Guardian name</dt><dd className="font-medium">{account.full_name}</dd></div>
            <div><dt className="text-slate-500">Login email</dt><dd className="break-all font-medium">{loginEmail}</dd></div>
          </dl>
          <p className="text-xs text-slate-500">
            For an incorrect guardian name or login email, contact the school administration.
          </p>
        </Card>
        <Card className="space-y-4">
          <div className="flex items-center gap-2"><Phone className="h-5 w-5 text-brand-700"/>
            <h2 className="font-semibold">Phone and WhatsApp</h2></div>
          <form onSubmit={save} noValidate className="space-y-4">
            <label className="block text-sm font-medium" htmlFor="guardian-phone">
              Telephone number (optional)
              <input id="guardian-phone" type="tel" maxLength={25} autoComplete="tel"
                value={phone} aria-invalid={!!errors.phone}
                onChange={e=>{setPhone(e.target.value);setErrors(v=>({...v,phone:""}));}}
                className="mt-1 block w-full rounded-xl border border-slate-300 px-3 py-2.5"
                placeholder="+234 800 000 0000"/>
              {errors.phone&&<p role="alert" className="mt-1 text-xs text-red-700">{errors.phone}</p>}
            </label>
            <label className="block text-sm font-medium" htmlFor="guardian-whatsapp">
              WhatsApp number (optional)
              <input id="guardian-whatsapp" type="tel" maxLength={25}
                value={whatsapp} aria-invalid={!!errors.whatsappNumber}
                onChange={e=>{setWhatsapp(e.target.value);setErrors(v=>({...v,whatsappNumber:""}));}}
                className="mt-1 block w-full rounded-xl border border-slate-300 px-3 py-2.5"
                placeholder="+234 800 000 0000"/>
              {errors.whatsappNumber&&<p role="alert" className="mt-1 text-xs text-red-700">{errors.whatsappNumber}</p>}
            </label>
            <Button type="submit" isLoading={busy} disabled={busy}><Save className="h-4 w-4"/> Save contacts</Button>
          </form>
        </Card>
        <Card className="space-y-2">
          <div className="flex items-center gap-2"><Users className="h-5 w-5 text-brand-700"/>
            <h2 className="font-semibold">Linked children</h2></div>
          <p className="text-sm text-slate-600">
            Only an administrator can add, remove or correct a child link after verifying guardianship.
            This protects every child&apos;s private school information.
          </p>
          <Link href="/parent/children" className="inline-block text-sm font-semibold text-brand-700 hover:underline">
            See my children →
          </Link>
        </Card>
      </>}
  </div>;
}
