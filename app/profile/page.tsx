"use client";

import { useCallback,useEffect,useState,type FormEvent } from "react";
import Link from "next/link";
import { Camera, Save, UserRound, RefreshCw } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

type Profile = {
  id:string;name:string;email:string;role:string;
  phone:string|null;whatsapp_number:string|null;avatar_url:string|null;
};
function errorMessage(body:unknown):string {
  const value=body as {error?:{message?:string}};
  return value?.error?.message||"The request could not be completed.";
}

export default function MyProfilePage(){
  const [profile,setProfile]=useState<Profile|null>(null);
  const [name,setName]=useState(""),[phone,setPhone]=useState(""),[whatsapp,setWhatsapp]=useState("");
  const [file,setFile]=useState<File|null>(null);
  const [busy,setBusy]=useState(false),[uploading,setUploading]=useState(false),[loading,setLoading]=useState(true);
  const [notice,setNotice]=useState(""),[error,setError]=useState("");

  const load=useCallback(async()=>{
    setLoading(true);
    try{
      const response=await fetch("/api/profile",{cache:"no-store"});
      const json=await response.json();
      if(!response.ok)throw new Error(errorMessage(json));
      const user=json.profile as Profile;
      setProfile(user);setName(user.name);setPhone(user.phone||"");setWhatsapp(user.whatsapp_number||"");
      setError("");
    }catch(e){setError(e instanceof Error?e.message:"Unable to load your profile.");}
    finally{setLoading(false);}
  },[]);
  useEffect(()=>{void load();},[load]);
  async function save(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setBusy(true);setError("");setNotice("");
    try{
      const response=await fetch("/api/profile",{
        method:"PATCH",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({name,phone,whatsappNumber:whatsapp}),
      });
      const json=await response.json();
      if(!response.ok)throw new Error(errorMessage(json));
      setProfile(json.profile);setNotice("Your profile details have been saved.");
    }catch(e){setError(e instanceof Error?e.message:"Could not save profile.");}
    finally{setBusy(false);}
  }
  async function upload(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(!file)return;
    setUploading(true);setError("");setNotice("");
    try{
      if(file.size>3*1024*1024)throw new Error("Choose a file no larger than 3 MB.");
      const form=new FormData();form.set("file",file);
      const response=await fetch("/api/profile/avatar",{method:"POST",body:form});
      const json=await response.json();
      if(!response.ok)throw new Error(errorMessage(json));
      setProfile(previous=>previous?{...previous,avatar_url:json.avatarUrl}:null);
      setFile(null);setNotice("Profile photo uploaded successfully.");
    }catch(e){setError(e instanceof Error?e.message:"Profile photo upload failed.");}
    finally{setUploading(false);}
  }
  return <div className="mx-auto max-w-3xl space-y-6">
    <div className="flex items-center justify-between gap-3">
      <div><p className="text-sm font-medium text-brand-700">Account</p>
        <h1 className="font-display text-2xl font-semibold text-slate-900">My profile</h1>
        <p className="mt-1 text-sm text-slate-500">Update your contact details and profile photo.</p>
      </div>
      <Button variant="secondary" size="sm" disabled={busy||uploading||loading} onClick={()=>void load()}>
        <RefreshCw className="h-4 w-4"/>Refresh</Button>
    </div>
    {error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {notice&&<p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
    {loading?<Card><p className="text-sm text-slate-500">Loading profile...</p></Card>: profile&&<>
      <Card>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-50 text-brand-700">
            {profile.avatar_url?<img src={profile.avatar_url} alt="Your profile" className="h-full w-full object-cover"/>:
              <UserRound className="h-9 w-9"/>}
          </div>
          <div>
            <h2 className="font-semibold text-slate-900">{profile.name}</h2>
            <p className="text-sm text-slate-500">{profile.email}</p>
            <p className="text-xs font-semibold text-brand-700">{profile.role.replaceAll("_"," ")}</p>
          </div>
        </div>
        <form onSubmit={upload} className="mt-5 flex flex-wrap items-end gap-3 border-t border-slate-100 pt-4">
          <div className="min-w-48 flex-1">
            <label htmlFor="avatar-upload" className="mb-1.5 block text-sm font-medium text-slate-700">Profile photo</label>
            <input id="avatar-upload" className="w-full text-sm" type="file" accept="image/jpeg,image/png,image/webp"
              onChange={e=>setFile(e.target.files?.[0]||null)}/>
            <p className="mt-1 text-xs text-slate-500">JPG, PNG or WebP, maximum 3 MB. Cloudinary must be configured by the administrator.</p>
          </div>
          <Button type="submit" disabled={!file||uploading} isLoading={uploading}>
            <Camera className="h-4 w-4"/>Upload photo</Button>
        </form>
      </Card>
      <Card>
        <h2 className="mb-4 font-semibold text-slate-900">Personal details</h2>
        <form onSubmit={save} className="space-y-4">
          <Input id="profile-name" label="Full name" required minLength={2} maxLength={120}
            value={name} onChange={e=>setName(e.target.value)}/>
          <Input id="profile-email" label="Login email (read only)" value={profile.email} disabled/>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input id="profile-phone" label="Phone number" value={phone} maxLength={32}
              onChange={e=>setPhone(e.target.value)} placeholder="+234..."/>
            <Input id="profile-whatsapp" label="WhatsApp number" value={whatsapp} maxLength={32}
              onChange={e=>setWhatsapp(e.target.value)} placeholder="+234..."/>
          </div>
          <div className="flex items-center justify-between gap-3">
            <Link href="/forgot-password" className="text-sm font-medium text-brand-700 hover:underline">Reset password</Link>
            <Button type="submit" isLoading={busy}><Save className="h-4 w-4"/>Save changes</Button>
          </div>
        </form>
      </Card>
    </>}
  </div>;
}
