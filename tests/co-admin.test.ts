import test from "node:test";
import assert from "node:assert/strict";
import {coAdminCreateSchema,coAdminStatusSchema,mayChangeCoAdmin} from "../lib/validations/co-admin";

test("Co-Admin creation only accepts name and email",()=>{
  assert.equal(coAdminCreateSchema.safeParse({fullName:"Amina Okoye",email:"amina@example.com"}).success,true);
  assert.equal(coAdminCreateSchema.safeParse({fullName:"Amina Okoye",email:"amina@example.com",role:"PRIMARY"}).success,false);
  assert.equal(coAdminCreateSchema.safeParse({fullName:"Amina Okoye",email:"amina@example.com",adminTier:"PRIMARY"}).success,false);
});
test("Original administrators and own account cannot be disabled",()=>{
  assert.equal(mayChangeCoAdmin("actor","owner","PRIMARY","ADMIN"),false);
  assert.equal(mayChangeCoAdmin("actor","actor","CO_ADMIN","ADMIN"),false);
  assert.equal(mayChangeCoAdmin("actor","other","CO_ADMIN","ADMIN"),true);
  assert.equal(mayChangeCoAdmin("actor","other","CO_ADMIN","TEACHER"),false);
});
test("status update rejects role or account privilege change",()=>{
  assert.equal(coAdminStatusSchema.safeParse({isActive:false}).success,true);
  assert.equal(coAdminStatusSchema.safeParse({isActive:false,role:"STUDENT"}).success,false);
});
