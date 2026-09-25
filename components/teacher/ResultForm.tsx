"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { Card, CardHeader } from "@/components/ui/Card";
import { Table, TableHead, TableBody, TableRow, TableHeaderCell, TableCell } from "@/components/ui/Table";
import { useToast } from "@/components/ui/Toast";

export interface ClassOption {
  id: string;
  name: string;
  subjects: { id: string; name: string; code: string }[];
}

export interface StudentOption {
  id: string;
  fullName: string;
  admissionNumber: string;
}

interface InitialScore {
  subjectId: string;
  ca: number;
  exam: number;
}

export interface ResultFormProps {
  mode: "create" | "edit";
  resultId?: string;
  classes: ClassOption[];
  studentsByClass: Record<string, StudentOption[]>;
  academicSessionId: string;
  termId: string;
  initial?: {
    classId: string;
    studentId: string;
    scores: InitialScore[];
    teacherRemarks?: string;
  };
}

export function ResultForm({
  mode,
  resultId,
  classes,
  studentsByClass,
  academicSessionId,
  termId,
  initial,
}: ResultFormProps) {
  const router = useRouter();
  const { showToast } = useToast();

  const [classId, setClassId] = useState(initial?.classId ?? "");
  const [studentId, setStudentId] = useState(initial?.studentId ?? "");
  const [scores, setScores] = useState<Record<string, { ca: string; exam: string }>>(() => {
    const map: Record<string, { ca: string; exam: string }> = {};
    for (const s of initial?.scores ?? []) {
      map[s.subjectId] = { ca: String(s.ca), exam: String(s.exam) };
    }
    return map;
  });
  const [teacherRemarks, setTeacherRemarks] = useState(initial?.teacherRemarks ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedClass = classes.find((c) => c.id === classId);
  const students = useMemo(() => studentsByClass[classId] ?? [], [classId, studentsByClass]);

  function updateScore(subjectId: string, field: "ca" | "exam", value: string) {
    setScores((prev) => ({
      ...prev,
      [subjectId]: { ...prev[subjectId], [field]: value } as { ca: string; exam: string },
    }));
  }

  function buildPayload() {
    const subjects = (selectedClass?.subjects ?? [])
      .map((subj) => {
        const entry = scores[subj.id];
        if (!entry || entry.ca === "" || entry.exam === "") return null;
        return { subjectId: subj.id, ca: Number(entry.ca), exam: Number(entry.exam) };
      })
      .filter((s): s is { subjectId: string; ca: number; exam: number } => s !== null);

    return {
      studentId,
      classId,
      academicSessionId,
      termId,
      subjects,
      teacherRemarks: teacherRemarks || undefined,
    };
  }

  async function handleSaveDraft() {
    setError(null);
    if (!classId || !studentId) {
      setError("Choose a class and a student first.");
      return;
    }
    const payload = buildPayload();
    if (payload.subjects.length === 0) {
      setError("Enter at least one subject's CA and exam scores.");
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch("/api/results", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error?.message || "Unable to save this result.");
        return;
      }
      showToast("Draft saved.", "success");
      router.push(`/teacher/results/${json.result.id}`);
      router.refresh();
    } catch {
      setError("Unable to reach the server. Please check your connection and try again.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSubmitForApproval() {
    if (!resultId) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/results/${resultId}/submit`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error?.message || "Unable to submit this result for approval.");
        return;
      }
      showToast("Submitted for approval.", "success");
      router.push("/teacher/results");
      router.refresh();
    } catch {
      setError("Unable to reach the server. Please check your connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      {error && <Alert variant="danger">{error}</Alert>}

      <Card>
        <CardHeader title="Student & class" description="Choose who this result is for." />
        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            label="Class"
            placeholder="Select a class"
            value={classId}
            disabled={mode === "edit"}
            onChange={(e) => {
              setClassId(e.target.value);
              setStudentId("");
            }}
            options={classes.map((c) => ({ value: c.id, label: c.name }))}
          />
          <Select
            label="Student"
            placeholder={classId ? "Select a student" : "Choose a class first"}
            value={studentId}
            disabled={mode === "edit" || !classId}
            onChange={(e) => setStudentId(e.target.value)}
            options={students.map((s) => ({ value: s.id, label: `${s.fullName} (${s.admissionNumber})` }))}
          />
        </div>
      </Card>

      {selectedClass && selectedClass.subjects.length > 0 && (
        <Card>
          <CardHeader
            title="Subject scores"
            description="Enter CA and exam scores for each subject you're assigned to teach in this class."
          />
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Subject</TableHeaderCell>
                <TableHeaderCell>CA</TableHeaderCell>
                <TableHeaderCell>Exam</TableHeaderCell>
                <TableHeaderCell>Total</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {selectedClass.subjects.map((subj) => {
                const entry = scores[subj.id] ?? { ca: "", exam: "" };
                const total = (Number(entry.ca) || 0) + (Number(entry.exam) || 0);
                return (
                  <TableRow key={subj.id}>
                    <TableCell className="font-medium text-slate-900">{subj.name}</TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        className="w-24"
                        value={entry.ca}
                        onChange={(e) => updateScore(subj.id, "ca", e.target.value)}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        className="w-24"
                        value={entry.exam}
                        onChange={(e) => updateScore(subj.id, "exam", e.target.value)}
                      />
                    </TableCell>
                    <TableCell className="font-medium text-slate-700">
                      {entry.ca || entry.exam ? total : "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      <Card>
        <CardHeader title="Remarks" description="Optional note about this student's performance this term." />
        <textarea
          value={teacherRemarks}
          onChange={(e) => setTeacherRemarks(e.target.value)}
          rows={3}
          maxLength={500}
          className="w-full rounded-xl border border-surface-border bg-white px-3.5 py-2.5 text-sm text-slate-800 focus-ring"
          placeholder="e.g. Shows strong improvement in problem-solving this term."
        />
      </Card>

      <div className="flex flex-wrap gap-3">
        <Button variant="secondary" onClick={handleSaveDraft} isLoading={isSaving}>
          {mode === "create" ? "Save as draft" : "Save changes"}
        </Button>
        {mode === "edit" && resultId && (
          <Button onClick={handleSubmitForApproval} isLoading={isSubmitting}>
            Submit for approval
          </Button>
        )}
      </div>
    </div>
  );
}
