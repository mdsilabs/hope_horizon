import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {classReportEntriesSchema,classPublicationActionSchema} from "../lib/validations/report-release";

const id="550e8400-e29b-41d4-a716-446655440000";
test("attendance + absences must equal total teaching days",()=>{
 const row={studentId:id,present:83,absent:7,totalDays:90,remark:"Good class participation."};
 assert.equal(classReportEntriesSchema.safeParse({entries:[row]}).success,true);
 assert.equal(classReportEntriesSchema.safeParse({entries:[{...row,totalDays:91}]}).success,false);
 assert.equal(classReportEntriesSchema.safeParse({entries:[row,row]}).success,false);
 assert.equal(classReportEntriesSchema.safeParse({entries:[{...row,role:"ADMIN"}]}).success,false);
 assert.equal(classReportEntriesSchema.safeParse({entries:[{...row,remark:""}]}).success,false);
});
test("class release accepts only two actions, not arbitrary student lists",()=>{
 assert.equal(classPublicationActionSchema.safeParse({action:"PUBLISH"}).success,true);
 assert.equal(classPublicationActionSchema.safeParse({action:"WITHDRAW"}).success,true);
 assert.equal(classPublicationActionSchema.safeParse({action:"PUBLISH",studentId:id}).success,false);
 assert.equal(classPublicationActionSchema.safeParse({action:"APPROVE"}).success,false);
});
test("migration has atomic release, signed head attribution and report metadata",()=>{
 const sql=readFileSync("supabase/migrations/0011_class_release_report_cards.sql","utf8");
 for(const name of ["hh_save_class_report_entries","hh_release_class_batch","hh_guard_compiled_result_release"]){
  assert.match(sql,new RegExp("create or replace function public\\."+name));
 }
 for(const tag of ["stamp","entries","require","copy","protect","release"]){
  assert.equal(sql.split("$"+tag+"$").length-1,2,tag+" SQL dollar quote pairs");
 }
 assert.match(sql,/r\.status='PENDING_APPROVAL'|r\.status=case/);
 assert.match(sql,/set_config\('hh.class_release_batch'/);
 assert.match(sql,/status='PUBLISHED'/);
 assert.match(sql,/release_state='LEGACY_MIXED'/);
});
