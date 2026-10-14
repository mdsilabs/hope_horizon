import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resultSchema, bulkResultUploadRowSchema } from "../lib/validations/result";
import { computeOverall, computeClassPositions, resolveGrade } from "../services/gradingService";

const id = (n: number) => `550e8400-e29b-41d4-a716-${String(n).padStart(12, "0")}`;
const base = {
  studentId: id(1), classId: id(2), academicSessionId: id(3), termId: id(4),
  subjects: [{ subjectId: id(5), ca: 30, exam: 60 }],
};

test("rejects duplicates, invalid numeric scores, and non-finite uploads", () => {
  assert.equal(resultSchema.safeParse(base).success, true);
  assert.equal(resultSchema.safeParse({ ...base, subjects: [base.subjects[0], base.subjects[0]] }).success, false);
  assert.equal(resultSchema.safeParse({ ...base, subjects: [{ ...base.subjects[0], ca: "Infinity" }] }).success, false);
  assert.equal(bulkResultUploadRowSchema.safeParse({ admissionNumber: "X", subjectCode: "MATH", ca: -1, exam: 70 }).success, false);
});

test("attendance requires whole days and exact reconciliation", () => {
  assert.equal(resultSchema.safeParse({ ...base, attendance: { present: 70, absent: 2, totalDays: 72 } }).success, true);
  assert.equal(resultSchema.safeParse({ ...base, attendance: { present: 70, absent: 2, totalDays: 71 } }).success, false);
  assert.equal(resultSchema.safeParse({ ...base, attendance: { present: 70.5, absent: 1.5, totalDays: 72 } }).success, false);
  assert.equal(resultSchema.safeParse({ ...base, attendance: { present: 0, absent: 0, totalDays: 0 } }).success, false);
});

test("rank ties use competition ranking with no mutation", () => {
  const input = [{ resultId: "B", overallTotal: 160 }, { resultId: "A", overallTotal: 180 },
    { resultId: "C", overallTotal: 160 }, { resultId: "D", overallTotal: 140 }];
  assert.deepEqual(computeClassPositions(input), { A: 1, B: 2, C: 2, D: 4 });
  assert.equal(input[0].resultId, "B");
});

test("averages and grading bands do not invent grades", () => {
  assert.deepEqual(computeOverall([{ total: 80 }, { total: 81 }, { total: 90 }]),
    { overallTotal: 251, overallAverage: 83.67 });
  assert.equal(resolveGrade(95, [{ minScore: 70, maxScore: 100, grade: "A" }]), "A");
  assert.equal(resolveGrade(55, [{ minScore: 70, maxScore: 100, grade: "A" }]), undefined);
  const service = readFileSync("services/resultService.ts", "utf8");
  assert.match(service, /computedSubjects.some\(\(score\) => !score.grade\)/);
});
