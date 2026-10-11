"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { BookOpen, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import type { SchoolLevel } from "@/types/database";

type SchoolClass = {
  id: string; name: string; level: SchoolLevel; arm: string | null;
  order: number; is_active: boolean; class_subjects: { subject_id: string }[];
};
type Subject = { id: string; name: string; code: string; is_active: boolean };

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...options });
  const body = await response.json();
  if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : body.error?.message || "Request failed.");
  return body as T;
}

export default function ClassManagementPage() {
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selected, setSelected] = useState("");
  const [newClass, setNewClass] = useState({ name: "", level: "SECONDARY" as SchoolLevel, arm: "", order: "0" });
  const [newSubject, setNewSubject] = useState({ name: "", code: "" });
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [classData, subjectData] = await Promise.all([
        api<{ classes: SchoolClass[] }>("/api/admin/classes"),
        api<{ subjects: Subject[] }>("/api/admin/subjects"),
      ]);
      setClasses(classData.classes);
      setSubjects(subjectData.subjects);
      setSelected((id) => id && classData.classes.some((c) => c.id === id) ? id : classData.classes[0]?.id || "");
      setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load school structure."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  async function createClass(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      await api("/api/admin/classes", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newClass.name, level: newClass.level, arm: newClass.arm, order: Number(newClass.order) }),
      });
      setNewClass({ name: "", level: "SECONDARY", arm: "", order: "0" });
      setNotice("Class created.");
      await reload();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not create class."); }
    finally { setBusy(false); }
  }

  async function createSubject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      await api("/api/admin/subjects", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newSubject),
      });
      setNewSubject({ name: "", code: "" });
      setNotice("Subject created. Assign it to a class below.");
      await reload();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not create subject."); }
    finally { setBusy(false); }
  }

  async function toggleSubject(subjectId: string, attached: boolean) {
    if (!selected) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await api("/api/admin/classes/" + selected + "/subjects", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subjectId, action: attached ? "DETACH" : "ATTACH" }),
      });
      setNotice(attached ? "Subject removed from this class." : "Subject assigned to this class.");
      await reload();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not change assignment."); }
    finally { setBusy(false); }
  }

  const current = classes.find((c) => c.id === selected);
  const assignments = new Set((current?.class_subjects ?? []).map((s) => s.subject_id));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl font-semibold text-slate-900">Classes &amp; subjects</h1>
          <p className="mt-1 text-sm text-slate-500">Create classes, register subjects and choose what each class studies.</p></div>
        <Button variant="secondary" size="sm" onClick={() => void reload()} disabled={loading || busy}>
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
      </div>
      {error && <div role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {notice && <div role="status" className="rounded-xl bg-green-50 p-3 text-sm text-green-700">{notice}</div>}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 flex items-center gap-2 font-semibold"><Plus className="h-4 w-4" /> Add class</h2>
          <form onSubmit={createClass} className="space-y-3">
            <Input label="Class name" value={newClass.name} required maxLength={80}
              onChange={(e) => setNewClass({ ...newClass, name: e.target.value })} placeholder="JSS 1" />
            <div className="grid gap-3 sm:grid-cols-2">
              <Select label="Level" value={newClass.level} options={["PRIMARY","SECONDARY","COLLEGE","UNIVERSITY","OTHER"].map((v) => ({ value: v, label: v }))}
                onChange={(e) => setNewClass({ ...newClass, level: e.target.value as SchoolLevel })} />
              <Input label="Arm (optional)" value={newClass.arm} onChange={(e) => setNewClass({ ...newClass, arm: e.target.value })} placeholder="A" />
            </div>
            <Button type="submit" disabled={busy}>Create class</Button>
          </form>
        </Card>
        <Card>
          <h2 className="mb-4 flex items-center gap-2 font-semibold"><Plus className="h-4 w-4" /> Add subject</h2>
          <form onSubmit={createSubject} className="space-y-3">
            <Input label="Subject name" value={newSubject.name} required
              onChange={(e) => setNewSubject({ ...newSubject, name: e.target.value })} placeholder="Mathematics" />
            <Input label="Subject code" value={newSubject.code} required
              onChange={(e) => setNewSubject({ ...newSubject, code: e.target.value })} placeholder="MTH" />
            <Button type="submit" disabled={busy}>Create subject</Button>
          </form>
        </Card>
      </div>
      <Card>
        <h2 className="mb-3 flex items-center gap-2 font-semibold"><BookOpen className="h-5 w-5" /> Class subject assignments</h2>
        <p className="mb-4 text-sm text-slate-500">Assign subjects before teachers enter student results.</p>
        <Select label="Choose a class" value={selected} onChange={(e) => setSelected(e.target.value)}
          options={classes.filter((c) => c.is_active).map((c) => ({ value: c.id, label: c.name + (c.arm ? " " + c.arm : "") }))} />
        {loading ? <p className="mt-4 text-sm text-slate-500">Loading classes...</p> :
          !current ? <p className="mt-4 text-sm text-slate-500">Create a class first.</p> :
          subjects.filter((s) => s.is_active).length === 0 ? <p className="mt-4 text-sm text-slate-500">Create a subject first.</p> :
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {subjects.filter((s) => s.is_active).map((subject) => {
              const attached = assignments.has(subject.id);
              return <label key={subject.id} className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 p-3 text-sm">
                <input type="checkbox" checked={attached} disabled={busy}
                  onChange={() => void toggleSubject(subject.id, attached)} className="h-4 w-4 accent-blue-600" />
                <span><span className="block font-medium">{subject.name}</span><span className="text-xs text-slate-500">{subject.code}</span></span>
              </label>;
            })}
          </div>}
      </Card>
      <p className="text-xs text-slate-500">{classes.length} classes · {subjects.length} subjects registered.</p>
    </div>
  );
}
