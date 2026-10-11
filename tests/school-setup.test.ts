import test from "node:test";
import assert from "node:assert/strict";
import { schoolSettingsSchema } from "../lib/validations/school-settings";
import { buildSetupSteps } from "../lib/admin/setup-progress";

const valid = {
  name: "Hope Horizon Academy", contactEmail: "office@hope.example", contactPhone: "+234 803 000 0000",
  address: "Makurdi", website: "https://example.org", levels: ["SECONDARY"] as ["SECONDARY"],
  academicStructureType: "TERM" as const, academicPeriodLabel: "Term", periodsPerSession: 3,
  caMaxScore: 40, examMaxScore: 60,
};
test("school settings accept valid school identity and grading maxima", () => {
  assert.equal(schoolSettingsSchema.safeParse(valid).success, true);
});
test("school settings reject score totals beyond 100", () => {
  assert.equal(schoolSettingsSchema.safeParse({ ...valid, examMaxScore: 70 }).success, false);
});
test("school settings reject duplicate levels, invalid websites and unauthorized fields", () => {
  assert.equal(schoolSettingsSchema.safeParse({ ...valid, levels: ["SECONDARY", "SECONDARY"] }).success, false);
  assert.equal(schoolSettingsSchema.safeParse({ ...valid, website: "javascript:alert(1)" }).success, false);
  assert.equal(schoolSettingsSchema.safeParse({ ...valid, schoolId: "different-school" }).success, false);
});
test("setup progress counts exactly six independent milestones", () => {
  const empty = buildSetupSteps({
    hasContact: false, hasAcademicPeriod: false, classCount: 0,
    assignedSubjectCount: 0, assignedTeacherCount: 0, studentCount: 0,
  });
  assert.equal(empty.length, 6);
  assert.equal(empty.filter(step => step.done).length, 0);
  const ready = buildSetupSteps({
    hasContact: true, hasAcademicPeriod: true, classCount: 4,
    assignedSubjectCount: 5, assignedTeacherCount: 3, studentCount: 20,
  });
  assert.equal(ready.filter(step => step.done).length, 6);
  assert.equal(ready.find(step => step.key === "teachers")?.href, "/admin/teachers");
});
