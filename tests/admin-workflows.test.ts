import test from "node:test";
import assert from "node:assert/strict";
import {
  academicCreateSchema, teacherProvisionSchema, teacherAssignmentsSchema, termCreateSchema,
} from "../lib/validations/admin-workflows";

const id = "550e8400-e29b-41d4-a716-446655440000";
test("provisions teacher input without accepting school or role from caller", () => {
  assert.equal(teacherProvisionSchema.safeParse({fullName:"John Okoro",email:"teacher@example.org",staffId:"T001"}).success,true);
  assert.equal(teacherProvisionSchema.safeParse({fullName:"John Okoro",email:"teacher@example.org",staffId:"T001",role:"ADMIN"}).success,false);
});
test("rejects malformed class/subject assignments", () => {
  assert.equal(teacherAssignmentsSchema.safeParse({assignedClassIds:[id], subjectAssignments:[{classId:id,subjectId:id}]}).success,true);
  assert.equal(teacherAssignmentsSchema.safeParse({subjectAssignments:[{classId:"wrong",subjectId:id}]}).success,false);
});
test("sessions reject impossible date ranges and invalid calendar days", () => {
  assert.equal(academicCreateSchema.safeParse({name:"2026/2027",startDate:"2026-09-01",endDate:"2027-07-31"}).success,true);
  assert.equal(academicCreateSchema.safeParse({name:"2026",startDate:"2026-10-10",endDate:"2026-09-01"}).success,false);
  assert.equal(academicCreateSchema.safeParse({name:"2026",startDate:"2026-02-30",endDate:"2026-11-01"}).success,false);
});
test("terms require session and ordered date range", () => {
  assert.equal(termCreateSchema.safeParse({academicSessionId:id,name:"First Term",order:1,startDate:"2026-09-01",endDate:"2026-12-15"}).success,true);
  assert.equal(termCreateSchema.safeParse({academicSessionId:id,name:"First Term",order:0,startDate:"2026-09-01",endDate:"2026-12-15"}).success,false);
});
