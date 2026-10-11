"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { GraduationCap, Plus, Search, X, Mail, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";

type SchoolClass = { id: string; name: string; arm: string | null; is_active: boolean };
type Student = {
  id: string; full_name: string; admission_number: string; registration_number: string | null;
  student_id: string | null; class_id: string; gender: "MALE" | "FEMALE" | "OTHER" | null;
  date_of_birth: string | null; passport_url: string | null; is_active: boolean;
  user_id: string | null; users: {email:string}|null;
};
type Form = { fullName: string; admissionNumber: string; registrationNumber: string;
  studentId: string; classId: string; gender: string; dateOfBirth: string; passportUrl: string };
const blank: Form = { fullName: "", admissionNumber: "", registrationNumber: "",
  studentId: "", classId: "", gender: "", dateOfBirth: "", passportUrl: "" };

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...options });
  const body = await response.json();
  if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : body.error?.message || "Request failed.");
  return body as T;
}

export default function StudentsPage() {
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [searchText, setSearchText] = useState("");
  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);
  const [form, setForm] = useState<Form>(blank);
  const [editing, setEditing] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loginStudent, setLoginStudent] = useState<Student | null>(null);
  const [loginEmail, setLoginEmail] = useState("");

  useEffect(() => {
    let active = true;
    void api<{ classes: SchoolClass[] }>("/api/admin/classes")
      .then((result) => { if (active) setClasses(result.classes.filter((c) => c.is_active)); })
      .catch((e) => { if (active) setError(e instanceof Error ? e.message : "Unable to load classes."); });
    return () => { active = false; };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page) });
      if (search) params.set("q", search);
      if (classFilter) params.set("classId", classFilter);
      const result = await api<{ students: Student[]; total: number }>("/api/admin/students?" + params);
      setStudents(result.students); setTotal(result.total); setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load students."); }
    finally { setLoading(false); }
  }, [page, search, classFilter, reloadKey]);

  useEffect(() => { void load(); }, [load]);

  function startCreate() { setForm({ ...blank, classId: classFilter || classes[0]?.id || "" }); setEditing(null); setShowForm(true); setError(""); }
  function startEdit(student: Student) {
    setForm({ fullName: student.full_name, admissionNumber: student.admission_number,
      registrationNumber: student.registration_number || "", studentId: student.student_id || "",
      classId: student.class_id, gender: student.gender || "",
      dateOfBirth: student.date_of_birth || "", passportUrl: student.passport_url || "" });
    setEditing(student.id); setShowForm(true); setError(""); setNotice("");
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      const payload = {
        fullName: form.fullName, admissionNumber: form.admissionNumber,
        registrationNumber: form.registrationNumber, studentId: form.studentId,
        classId: form.classId, passportUrl: form.passportUrl,
        ...(form.gender ? { gender: form.gender } : {}),
        ...(form.dateOfBirth ? { dateOfBirth: form.dateOfBirth } : {}),
      };
      await api("/api/admin/students" + (editing ? "/" + editing : ""), {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setNotice(editing ? "Student details updated." : "Student enrolled. This does not create a portal login.");
      setShowForm(false); setEditing(null);
      setReloadKey((v) => v + 1);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to save student."); }
    finally { setBusy(false); }
  }

  async function toggleActive(student: Student) {
    if (student.is_active && !window.confirm("Deactivate this student? Their historical results will be retained.")) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await api("/api/admin/students/" + student.id, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !student.is_active }),
      });
      setNotice(student.is_active ? "Student deactivated. Historical results are retained." : "Student reactivated.");
      setReloadKey((v) => v + 1);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to update student."); }
    finally { setBusy(false); }
  }

  async function activateLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!loginStudent) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await api<{message:string}>("/api/admin/students/" + loginStudent.id + "/account", {
        method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({email:loginEmail}),
      });
      setNotice(result.message);
      setLoginStudent(null); setLoginEmail(""); setReloadKey(v=>v+1);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not create login."); }
    finally { setBusy(false); }
  }
  async function resendLogin(student: Student) {
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await api<{message:string}>("/api/admin/students/" + student.id + "/send-setup",{method:"POST"});
      setNotice(result.message);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not request setup email."); }
    finally { setBusy(false); }
  }

  const classLabel = (id: string) => {
    const found = classes.find((c) => c.id === id);
    return found ? found.name + (found.arm ? " " + found.arm : "") : "Unassigned / inactive";
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl font-semibold text-slate-900">Students</h1>
          <p className="mt-1 text-sm text-slate-500">Enrol pupils, allocate classes and activate individual portal logins.</p></div>
        <Button onClick={startCreate} disabled={classes.length === 0}><Plus className="h-4 w-4" /> Enrol student</Button>
      </div>
      {error && <div role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {notice && <div role="status" className="rounded-xl bg-green-50 p-3 text-sm text-green-700">{notice}</div>}
      {classes.length === 0 && <Card><p className="text-sm text-amber-700">Create an active class under Classes &amp; Subjects before enrolling students.</p></Card>}
      {showForm && <Card>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold">{editing ? "Edit student" : "Enrol student"}</h2>
          <button type="button" aria-label="Close form" onClick={() => setShowForm(false)}><X className="h-5 w-5" /></button>
        </div>
        <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
          <Input label="Full name" required value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
          <Input label="Admission number" required value={form.admissionNumber} onChange={(e) => setForm({ ...form, admissionNumber: e.target.value })} />
          <Input label="Registration number (optional)" value={form.registrationNumber} onChange={(e) => setForm({ ...form, registrationNumber: e.target.value })} />
          <Input label="Student ID (optional)" value={form.studentId} onChange={(e) => setForm({ ...form, studentId: e.target.value })} />
          <Select label="Class" required value={form.classId} options={classes.map((c) => ({ value: c.id, label: classLabel(c.id) }))}
            onChange={(e) => setForm({ ...form, classId: e.target.value })} />
          <Select label="Gender (optional)" value={form.gender} options={[
            { value: "", label: "Not specified" }, { value: "MALE", label: "Male" },
            { value: "FEMALE", label: "Female" }, { value: "OTHER", label: "Other" },
          ]} onChange={(e) => setForm({ ...form, gender: e.target.value })} />
          <Input label="Date of birth (optional)" type="date" value={form.dateOfBirth}
            onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })} />
          <Input label="Passport photo URL (optional)" type="url" value={form.passportUrl}
            onChange={(e) => setForm({ ...form, passportUrl: e.target.value })} />
          <div className="flex items-center gap-2 sm:col-span-2">
            <Button type="submit" isLoading={busy} disabled={!form.classId}>Save student</Button>
            <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>Cancel</Button>
          </div>
        </form>
      </Card>}
      {loginStudent && <Card>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div><h2 className="font-semibold">Activate student login</h2>
            <p className="mt-1 text-sm text-slate-600">{loginStudent.full_name} · {loginStudent.admission_number}</p>
            <p className="mt-1 text-xs text-slate-500">Creates an individual student account. A password-setup email will be requested; no password is shown or stored.</p>
          </div>
          <button type="button" aria-label="Close account setup" onClick={()=>setLoginStudent(null)}><X className="h-5 w-5"/></button>
        </div>
        <form onSubmit={activateLogin} className="flex flex-wrap items-end gap-3">
          <div className="min-w-48 flex-1"><Input id="student-login-email" type="email" label="Student's email address" required
            value={loginEmail} onChange={e=>setLoginEmail(e.target.value)} placeholder="student@example.com"/></div>
          <Button type="submit" disabled={busy} isLoading={busy}><UserPlus className="h-4 w-4"/> Create login</Button>
        </form>
      </Card>}
      <Card>
        <form className="mb-4 flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); setPage(1); setSearch(searchText.trim()); }}>
          <div className="min-w-44 flex-1"><Input label="Search by student name" value={searchText} maxLength={80}
            onChange={(e) => setSearchText(e.target.value)} placeholder="Name" /></div>
          <div className="min-w-44 flex-1"><Select label="Class" value={classFilter}
            onChange={(e) => { setClassFilter(e.target.value); setPage(1); }}
            options={[{ value: "", label: "All classes" }, ...classes.map((c) => ({ value: c.id, label: classLabel(c.id) }))]} /></div>
          <Button type="submit" variant="secondary"><Search className="h-4 w-4" /> Search</Button>
        </form>
        {loading ? <p className="py-10 text-center text-sm text-slate-500">Loading students...</p> :
          students.length === 0 ? <div className="py-12 text-center"><GraduationCap className="mx-auto h-9 w-9 text-slate-400" />
            <p className="mt-2 text-sm text-slate-500">No students match your filters.</p></div> :
          <div className="overflow-x-auto">
            <table className="w-full min-w-[650px] text-left text-sm">
              <thead className="border-b bg-slate-50 text-xs uppercase text-slate-500"><tr>
                <th className="p-3">Student</th><th className="p-3">Admission no.</th>
                <th className="p-3">Class</th><th className="p-3">Status</th><th className="p-3">Login</th><th className="p-3">Actions</th>
              </tr></thead>
              <tbody className="divide-y">{students.map((student) => <tr key={student.id}>
                <td className="p-3 font-medium text-slate-900">{student.full_name}</td>
                <td className="p-3">{student.admission_number}</td><td className="p-3">{classLabel(student.class_id)}</td>
                <td className="p-3">{student.is_active ? "Active" : "Inactive"}</td>
                <td className="p-3 text-xs">{student.user_id ? <><span className="font-medium text-green-700">Linked</span><span className="block text-slate-500">{student.users?.email}</span></> : "Not enabled"}</td>
                <td className="space-x-3 p-3">
                  {student.is_active && (student.user_id
                    ? <button type="button" disabled={busy} className="inline-flex items-center gap-1 font-medium text-brand-600 hover:underline" onClick={()=>void resendLogin(student)}><Mail className="h-3 w-3"/> Email setup</button>
                    : <button type="button" disabled={busy} className="inline-flex items-center gap-1 font-medium text-brand-600 hover:underline" onClick={()=>{setLoginStudent(student);setLoginEmail("");setError("");}}><UserPlus className="h-3 w-3"/> Create login</button>)}
                  <button type="button" className="font-medium text-brand-600 hover:underline" onClick={() => startEdit(student)}>Edit</button>
                  <button type="button" disabled={busy} className="font-medium text-slate-600 hover:underline"
                    onClick={() => void toggleActive(student)}>{student.is_active ? "Deactivate" : "Reactivate"}</button>
                </td>
              </tr>)}</tbody>
            </table>
          </div>}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500">
          <span>{total} student(s) · Page {page} of {Math.max(1, Math.ceil(total / 25))}</span>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" disabled={page === 1 || loading} onClick={() => setPage((p) => p - 1)}>Previous</Button>
            <Button size="sm" variant="secondary" disabled={page * 25 >= total || loading} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
