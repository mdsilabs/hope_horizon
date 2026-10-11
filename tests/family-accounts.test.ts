import test from "node:test";
import assert from "node:assert/strict";
import { studentAccountSchema, parentCreateSchema, parentChildrenSchema } from "../lib/validations/family-accounts";

const child="550e8400-e29b-41d4-a716-446655440000";
test("student login activation accepts email only",()=>{
  assert.equal(studentAccountSchema.safeParse({email:"child@example.com"}).success,true);
  assert.equal(studentAccountSchema.safeParse({email:"child@example.com",role:"ADMIN"}).success,false);
  assert.equal(studentAccountSchema.safeParse({email:"not an email"}).success,false);
});
test("parent provisioning requires children and refuses duplicates",()=>{
  const valid={fullName:"Amina Obi",email:"amina@example.com",studentIds:[child]};
  assert.equal(parentCreateSchema.safeParse(valid).success,true);
  assert.equal(parentCreateSchema.safeParse({...valid,studentIds:[]}).success,false);
  assert.equal(parentCreateSchema.safeParse({...valid,studentIds:[child,child]}).success,false);
  assert.equal(parentCreateSchema.safeParse({...valid,schoolId:child}).success,false);
});
test("editing family links accepts only student identifiers",()=>{
  assert.equal(parentChildrenSchema.safeParse({studentIds:[child]}).success,true);
  assert.equal(parentChildrenSchema.safeParse({studentIds:[child],parentId:child}).success,false);
});
