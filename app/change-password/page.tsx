"use client";
import {useState,type FormEvent} from "react";
import {useRouter} from "next/navigation";
import {Button} from "@/components/ui/Button";
import {Input} from "@/components/ui/Input";
import {Alert} from "@/components/ui/Alert";
import {createClient} from "@/lib/supabase/client";

export default function ChangeTemporaryPasswordPage(){
 const router=useRouter();
 const [current,setCurrent]=useState(""),[next,setNext]=useState(""),[confirm,setConfirm]=useState("");
 const [error,setError]=useState(""),[busy,setBusy]=useState(false);
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();setError("");
  if(next!==confirm){setError("The new passwords do not match.");return;}
  if(next.length<12||!/[A-Z]/.test(next)||!/[a-z]/.test(next)||!/[0-9]/.test(next)){
   setError("Choose at least 12 characters with uppercase, lowercase and a number.");return;
  }
  setBusy(true);
  try{
   const response=await fetch("/api/auth/set-password",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({flow:"TEMPORARY_PASSWORD",currentPassword:current,newPassword:next}),
    cache:"no-store",
   });
   const data=await response.json();
   if(!response.ok)throw new Error(data.error?.message||"Unable to change password.");
   await createClient().auth.signOut();
   router.replace("/login?passwordUpdated=1");router.refresh();
  }catch(e){setError(e instanceof Error?e.message:"Unable to change password.");}
  finally{setBusy(false);}
 }
 return <main className="flex min-h-screen items-center justify-center bg-surface-muted px-4">
  <div className="w-full max-w-md space-y-4 rounded-2xl border border-surface-border bg-white p-6 shadow-card">
   <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-500 text-sm font-bold text-white">HH</div>
   <h1 className="font-display text-2xl font-semibold text-slate-900">Set your private password</h1>
   <p className="text-sm text-slate-600">Your school administrator gave you a temporary password.
    Replace it with a private password before using any administrator features. No email is needed.</p>
   {error&&<Alert variant="danger">{error}</Alert>}
   <form onSubmit={submit} className="space-y-4">
    <Input label="Temporary password" type="password" autoComplete="current-password"
      required value={current} onChange={e=>setCurrent(e.target.value)}/>
    <Input label="New private password" type="password" autoComplete="new-password"
      required minLength={12} value={next} onChange={e=>setNext(e.target.value)}/>
    <Input label="Confirm private password" type="password" autoComplete="new-password"
      required value={confirm} onChange={e=>setConfirm(e.target.value)}/>
    <Button type="submit" fullWidth isLoading={busy}>Change password and continue</Button>
   </form>
   <p className="text-xs text-slate-500">At least 12 characters, including an uppercase letter, lowercase letter and number.</p>
  </div>
 </main>;
}
