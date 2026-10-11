"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { passwordSchema } from "@/lib/validations/common";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";

const schema = z.object({
  newPassword: passwordSchema,
  confirmPassword: z.string(),
}).refine(data=>data.newPassword===data.confirmPassword,{
  message:"Passwords do not match",path:["confirmPassword"],
});
type FormInput=z.infer<typeof schema>;

export default function ResetPasswordPage(){
  const router=useRouter();
  const [error,setError]=useState<string|null>(null);
  const [ready,setReady]=useState(false);
  const [checking,setChecking]=useState(true);
  const [success,setSuccess]=useState(false);
  const {register,handleSubmit,formState:{errors,isSubmitting}}=useForm<FormInput>({
    resolver:zodResolver(schema),
  });

  useEffect(()=>{
    let active=true;
    const supabase=createClient();
    const url=new URL(window.location.href);
    const code=url.searchParams.get("code");
    // Supabase can provide recovery proof via an implicit-flow fragment,
    // or a PKCE ?code=... that must be exchanged for a session.
    const fragment=new URLSearchParams(url.hash.replace(/^#/,""));
    const hasRecoveryFragment=fragment.get("type")==="recovery";
    const listener=supabase.auth.onAuthStateChange((event)=>{
      if(active && event==="PASSWORD_RECOVERY"){
        setReady(true);setError(null);setChecking(false);
      }
    });
    async function check(){
      try{
        if(code){
          const {data:session}=await supabase.auth.getSession();
          // A browser client may already have exchanged the code.
          if(!session.session){
            const {error:exchangeError}=await supabase.auth.exchangeCodeForSession(code);
            if(exchangeError)throw exchangeError;
          }
          if(active){setReady(true);setError(null);}
          url.searchParams.delete("code");
          window.history.replaceState({}, "", url.pathname+url.search);
        } else if(hasRecoveryFragment){
          // Supabase's browser client exchanges the fragment automatically.
          const {data}=await supabase.auth.getSession();
          if(active && data.session){setReady(true);setError(null);}
        } else {
          if(active)setError("Open the password-setup link from your email to continue.");
        }
      }catch{
        if(active)setError("This password-setup link is invalid or expired. Request a new email from your school.");
      }finally{if(active)setChecking(false);}
    }
    void check();
    return()=>{active=false;listener.data.subscription.unsubscribe();};
  },[]);

  async function submit(values:FormInput){
    if(!ready)return;
    setError(null);
    const supabase=createClient();
    const {error:updateError}=await supabase.auth.updateUser({password:values.newPassword});
    if(updateError){setError("Unable to update your password. The setup link may have expired.");return;}
    await supabase.auth.signOut();
    setSuccess(true);
    router.replace("/login");
    router.refresh();
  }
  return <div className="flex min-h-screen items-center justify-center bg-surface-muted px-4">
    <div className="w-full max-w-sm">
      <div className="mb-8 text-center">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-brand-500 font-display text-sm font-bold text-white">HH</div>
        <h1 className="mt-4 font-display text-xl font-semibold text-slate-900">Set your portal password</h1>
        <p className="mt-1 text-sm text-slate-500">Hope Horizon Academy</p>
      </div>
      <div className="rounded-2xl border border-surface-border bg-white p-6 shadow-card">
        {checking?<p className="text-sm text-slate-600">Verifying your password-setup link...</p>:
        success?<Alert variant="success" title="Password updated">Sign in with your new password.</Alert>:
        !ready?<div className="space-y-3">
          <Alert variant="danger">{error||"Unable to verify the password-setup link."}</Alert>
          <Link href="/forgot-password" className="text-sm font-medium text-brand-700 underline">Request another link</Link>
        </div>:
        <form onSubmit={handleSubmit(submit)} className="space-y-4">
          {error&&<Alert variant="danger">{error}</Alert>}
          <Input label="New password" type="password" autoComplete="new-password"
            error={errors.newPassword?.message} {...register("newPassword")}/>
          <Input label="Confirm new password" type="password" autoComplete="new-password"
            error={errors.confirmPassword?.message} {...register("confirmPassword")}/>
          <Button type="submit" fullWidth isLoading={isSubmitting}>Set password</Button>
        </form>}
      </div>
    </div>
  </div>;
}
