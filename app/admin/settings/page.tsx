"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, RefreshCw, Save, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { ACADEMIC_STRUCTURE_TYPES, SCHOOL_LEVELS } from "@/types/enums";
import type { SchoolLevel } from "@/types/database";
import type { SchoolSettingsInput } from "@/lib/validations/school-settings";

type DbSchool = {
  id: string; name: string; contact_email: string | null; contact_phone: string | null;
  address: string | null; website: string | null; levels: SchoolLevel[];
  academic_structure_type: SchoolSettingsInput["academicStructureType"];
  academic_period_label: string; periods_per_session: number;
  ca_max_score: number; exam_max_score: number;
  require_approval_before_publish: boolean; enable_qr_verification: boolean;
};

function formFromSchool(school: DbSchool): SchoolSettingsInput {
  return {
    name: school.name,
    contactEmail: school.contact_email ?? "",
    contactPhone: school.contact_phone ?? "",
    address: school.address ?? "",
    website: school.website ?? "",
    levels: school.levels,
    academicStructureType: school.academic_structure_type,
    academicPeriodLabel: school.academic_period_label,
    periodsPerSession: school.periods_per_session,
    caMaxScore: school.ca_max_score,
    examMaxScore: school.exam_max_score,
    requireApprovalBeforePublish: school.require_approval_before_publish,
    enableQrVerification: school.enable_qr_verification,
  };
}

const defaultForm: SchoolSettingsInput = {
  name: "", contactEmail: "", contactPhone: "", address: "", website: "",
  levels: ["SECONDARY"], academicStructureType: "TERM", academicPeriodLabel: "Term",
  periodsPerSession: 3, caMaxScore: 40, examMaxScore: 60,
  requireApprovalBeforePublish: true, enableQrVerification: true,
};

function getError(body: unknown): string {
  if (typeof body === "object" && body !== null && "error" in body) {
    const error = (body as {error?: {message?:string} | string}).error;
    if (typeof error === "string") return error;
    if (error?.message) return error.message;
  }
  return "The request could not be completed.";
}

export default function SchoolSettingsPage() {
  const router = useRouter();
  const [form, setForm] = useState<SchoolSettingsInput>(defaultForm);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/admin/school", {cache:"no-store"});
      const body = await response.json();
      if (!response.ok) throw new Error(getError(body));
      setForm(formFromSchool(body.school as DbSchool));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load settings.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  function field<K extends keyof SchoolSettingsInput>(key: K, value: SchoolSettingsInput[K]) {
    setForm(current => ({...current, [key]: value}));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (form.caMaxScore + form.examMaxScore !== 100) {
      setError("CA and exam scores must add up to 100.");
      return;
    }
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin/school", {
        method:"PATCH", headers:{"Content-Type":"application/json"},
        body:JSON.stringify(form),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(getError(body));
      setForm(formFromSchool(body.school as DbSchool));
      setNotice("School settings saved successfully.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save school settings.");
    } finally {
      setBusy(false);
    }
  }

  function toggleLevel(level: SchoolLevel) {
    field("levels", form.levels.includes(level)
      ? form.levels.filter(v=>v!==level)
      : [...form.levels, level]);
  }

  return <div className="mx-auto max-w-4xl space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <Link href="/admin/setup" className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline">
          <ArrowLeft className="h-4 w-4"/> School setup
        </Link>
        <h1 className="font-display text-2xl font-semibold text-slate-900">School settings</h1>
        <p className="mt-1 text-sm text-slate-500">Update the school identity, academic structure and result rules.</p>
      </div>
      <Button variant="secondary" size="sm" disabled={loading||busy} onClick={()=>void load()}>
        <RefreshCw className="h-4 w-4"/> Refresh
      </Button>
    </div>

    {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {notice && <p role="status" className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-800">{notice}</p>}
    {loading ? <Card><p className="text-sm text-slate-500">Loading your school settings...</p></Card> :
      <form onSubmit={save} className="space-y-5">
        <Card className="space-y-4">
          <div>
            <h2 className="font-semibold text-slate-900">School identity</h2>
            <p className="mt-1 text-sm text-slate-500">These details help families identify and reach the school.</p>
          </div>
          <Input id="school-name" label="School name" required maxLength={160}
            value={form.name} onChange={e=>field("name",e.target.value)}/>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input id="school-email" label="Contact email" type="email" maxLength={254}
              value={form.contactEmail} onChange={e=>field("contactEmail",e.target.value)}
              placeholder="office@school.edu.ng"/>
            <Input id="school-phone" label="Contact phone" type="tel" maxLength={40}
              value={form.contactPhone} onChange={e=>field("contactPhone",e.target.value)}
              placeholder="+234..."/>
          </div>
          <Input id="school-address" label="School address" maxLength={350}
            value={form.address} onChange={e=>field("address",e.target.value)}/>
          <Input id="school-website" label="School website (optional)" type="url" maxLength={250}
            placeholder="https://example.edu.ng" value={form.website}
            onChange={e=>field("website",e.target.value)}/>
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-slate-700">Education levels</legend>
            <div className="flex flex-wrap gap-2">
              {SCHOOL_LEVELS.map(level=><label key={level}
                className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                <input type="checkbox" checked={form.levels.includes(level)} onChange={()=>toggleLevel(level)}
                  className="h-4 w-4 accent-blue-600"/> {level.replace("_"," ")}
              </label>)}
            </div>
            <p className="mt-2 text-xs text-slate-500">Choose at least one level.</p>
          </fieldset>
        </Card>
        <Card className="space-y-4">
          <div>
            <h2 className="font-semibold text-slate-900">Academic structure</h2>
            <p className="mt-1 text-sm text-slate-500">
              Once periods are created, their structure is locked to protect historical results.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Select id="academic-structure" label="Academic structure"
              options={ACADEMIC_STRUCTURE_TYPES.map(x=>({value:x,label:x.toLowerCase().replace(/^./,c=>c.toUpperCase())}))}
              value={form.academicStructureType}
              onChange={e=>field("academicStructureType",e.target.value as SchoolSettingsInput["academicStructureType"])}/>
            <Input id="academic-label" label="Period label" maxLength={40} required
              value={form.academicPeriodLabel} onChange={e=>field("academicPeriodLabel",e.target.value)}/>
          </div>
          <Input id="period-count" label="Periods per academic session" type="number" min={1} max={6} required
            value={form.periodsPerSession} onChange={e=>field("periodsPerSession",Number(e.target.value))}/>
        </Card>
        <Card className="space-y-4">
          <div>
            <h2 className="font-semibold text-slate-900">Scoring and result rules</h2>
            <p className="mt-1 text-sm text-slate-500">CA + examination maxima must total 100. Score limits are locked after results exist.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input id="ca-max" label="Continuous assessment maximum" type="number" required min={0} max={100}
              value={form.caMaxScore} onChange={e=>field("caMaxScore",Number(e.target.value))}/>
            <Input id="exam-max" label="Exam maximum" type="number" required min={0} max={100}
              value={form.examMaxScore} onChange={e=>field("examMaxScore",Number(e.target.value))}/>
          </div>
          <p className="text-sm text-slate-500">Combined maximum: <strong className={form.caMaxScore+form.examMaxScore===100?"text-slate-900":"text-red-700"}>
            {form.caMaxScore + form.examMaxScore}/100</strong></p>
          <label className="flex items-center gap-3 text-sm font-medium text-slate-700">
            <input type="checkbox" className="h-4 w-4 accent-blue-600" checked={form.requireApprovalBeforePublish}
              onChange={e=>field("requireApprovalBeforePublish",e.target.checked)}/>
            Require approval before publishing results
          </label>
          <label className="flex items-center gap-3 text-sm font-medium text-slate-700">
            <input type="checkbox" className="h-4 w-4 accent-blue-600" checked={form.enableQrVerification}
              onChange={e=>field("enableQrVerification",e.target.checked)}/>
            Enable QR result verification
          </label>
          <p className="text-xs text-slate-500">The approval workflow still enforces its current server-side publishing rules; these preferences do not bypass required approvals.</p>
        </Card>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="flex items-center gap-2 text-sm text-slate-600">
            <ShieldCheck className="h-4 w-4 text-brand-600"/> Only school administrators can save changes.
          </p>
          <Button type="submit" disabled={busy||!form.levels.length} isLoading={busy}>
            <Save className="h-4 w-4"/> Save school settings
          </Button>
        </div>
      </form>}
  </div>;
}
