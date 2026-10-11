import test from "node:test";
import assert from "node:assert/strict";
import {
  adminClassCreateSchema, adminSubjectCreateSchema,
  adminStudentCreateSchema, adminStudentPatchSchema, classSubjectActionSchema,
} from "../lib/validations/admin";

const schoolClassId = "550e8400-e29b-41d4-a716-446655440000";

test("validates a class without requiring existing teacher assignments", () => {
  const input = adminClassCreateSchema.parse({ name: "JSS 1", level: "SECONDARY", arm: "A" });
  assert.equal(input.order, 0);
});
test("rejects injecting class-teacher IDs into class creation", () => {
  assert.equal(adminClassCreateSchema.safeParse({ name: "JSS 1", level: "SECONDARY", classTeacherId: schoolClassId }).success, false);
});
test("accepts student enrolment without portal credentials", () => {
  const student = adminStudentCreateSchema.parse({ fullName: "Ada Okoro", admissionNumber: "HH/003", classId: schoolClassId });
  assert.equal(student.parentIds, undefined);
});
test("rejects parent IDs until verified linking is implemented", () => {
  assert.equal(adminStudentCreateSchema.safeParse({
    fullName: "Ada Okoro", admissionNumber: "HH/003", classId: schoolClassId, parentIds: [schoolClassId],
  }).success, false);
});
test("does not allow empty student patches", () => {
  assert.equal(adminStudentPatchSchema.safeParse({}).success, false);
  assert.equal(adminStudentPatchSchema.safeParse({ isActive: false }).success, true);
});
test("requires valid subject identifiers and known actions", () => {
  assert.equal(classSubjectActionSchema.safeParse({ subjectId: "not-a-uuid", action: "ATTACH" }).success, false);
  assert.equal(classSubjectActionSchema.safeParse({ subjectId: schoolClassId, action: "DELETE_ALL" }).success, false);
});
test("requires subject name and code", () => {
  assert.equal(adminSubjectCreateSchema.safeParse({ name: "Math", code: "MTH" }).success, true);
  assert.equal(adminSubjectCreateSchema.safeParse({ name: "Math" }).success, false);
});
