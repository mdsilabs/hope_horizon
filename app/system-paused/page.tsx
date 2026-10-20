import Link from "next/link";
import {PauseCircle} from "lucide-react";
import {createClient} from "@/lib/supabase/server";

export const dynamic="force-dynamic";
export default async function SystemPausedPage(){
  let notice="The school portal is temporarily unavailable for maintenance.";
  let paused=true;
  try{
    const db=await createClient();
    const {data}=await db.from("platform_installation_controls")
      .select("paused,notice").eq("id",1).maybeSingle();
    if(data){notice=data.notice;paused=data.paused;}
  }catch{/* Keep neutral fallback when database is temporarily unreachable. */}
  return <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
    <div className="w-full max-w-lg rounded-2xl border bg-white p-8 text-center shadow-sm">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-50">
        <PauseCircle className="h-9 w-9 text-amber-700"/>
      </div>
      <h1 className="mt-4 text-2xl font-semibold text-slate-900">
        {paused?"School portal temporarily paused":"School portal available"}
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-slate-600">
        {paused?notice:"Maintenance has ended. You can return to your account."}
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link href="/login" className="rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white">
          Sign in
        </Link>
        <Link href="/admin/platform-control" className="rounded-xl border px-4 py-2.5 text-sm font-medium text-brand-700">
          Owner controls
        </Link>
      </div>
    </div>
  </main>;
}
