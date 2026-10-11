import test from "node:test";
import assert from "node:assert/strict";
import {coAdminCreateSchema,coAdminStatusSchema,mayChangeCoAdmin} from "../lib/validations/co-admin";
import {setPasswordSchema} from "../lib/validations/set-password";
import {readFileSync} from "node:fs";

const base={fullName:"Amina Okoye",email:"amina@example.com"};
test("Co-Admin setup supports both direct password and Gmail email methods",()=>{
 for(const setupMethod of ["TEMPORARY_PASSWORD","EMAIL_LINK"]){
  assert.equal(coAdminCreateSchema.safeParse({...base,setupMethod}).success,true);
 }
 assert.equal(coAdminCreateSchema.safeParse(base).success,false);
 assert.equal(coAdminCreateSchema.safeParse({...base,setupMethod:"TEMPORARY_PASSWORD",password:"adminChosen123"}).success,false);
 assert.equal(coAdminCreateSchema.safeParse({...base,setupMethod:"EMAIL_LINK",role:"PRIMARY"}).success,false);
 assert.equal(coAdminCreateSchema.safeParse({...base,setupMethod:"EMAIL_LINK",adminTier:"PRIMARY"}).success,false);
});
test("Primary and self accounts cannot be deactivated",()=>{
 assert.equal(mayChangeCoAdmin("admin","owner","PRIMARY","ADMIN"),false);
 assert.equal(mayChangeCoAdmin("admin","admin","CO_ADMIN","ADMIN"),false);
 assert.equal(mayChangeCoAdmin("admin","another","CO_ADMIN","ADMIN"),true);
 assert.equal(mayChangeCoAdmin("admin","another","CO_ADMIN","TEACHER"),false);
});
test("Only status changes are allowed for existing co-admin",()=>{
 assert.equal(coAdminStatusSchema.safeParse({isActive:false}).success,true);
 assert.equal(coAdminStatusSchema.safeParse({isActive:false,role:"TEACHER"}).success,false);
});
test("Password setup requires a strong new password",()=>{
 assert.equal(setPasswordSchema.safeParse({newPassword:"LongAndUnique23!"}).success,true);
 assert.equal(setPasswordSchema.safeParse({newPassword:"Short1!"}).success,false);
 assert.equal(setPasswordSchema.safeParse({newPassword:"LongAndUnique23!",role:"ADMIN"}).success,false);
});
test("SQL guards password-setup flag and reduces role/school RLS scope",()=>{
 const s=readFileSync("supabase/migrations/0012_onboarding_password_guard.sql","utf8");
 for(const tag of ["flag_guard","school","role"]) assert.equal(s.split("$"+tag+"$").length-1,2);
 assert.match(s,/new.must_change_password is distinct from old.must_change_password/);
 assert.match(s,/and not u.must_change_password/);
 assert.match(s,/id=\(select auth.uid\(\)\)/);
});
