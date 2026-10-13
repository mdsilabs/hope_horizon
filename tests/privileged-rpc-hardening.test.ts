import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const s=readFileSync("supabase/migrations/0013_privileged_rpc_auth_guard.sql","utf8");
const required=[
 "hh_admin_replace_teacher_assignments","hh_admin_activate_term",
 "hh_admin_replace_parent_children","hh_save_subject_markbook",
 "hh_compile_class_results","hh_head_decide_class_batch",
 "hh_request_subject_correction","hh_clear_subject_correction",
 "hh_signoff_class_review","hh_save_class_report_entries",
 "hh_release_class_batch",
];
test("migration 0013 guards every privileged writable RPC",()=>{
 for(const name of required){
   assert.match(s,new RegExp("alter function public\\."+name+"\\("));
   assert.match(s,new RegExp("revoke all on function public\\."+name+"_internal\\("));
   assert.match(s,new RegExp("create function public\\."+name+"\\("));
   assert.match(s,new RegExp("return public\\."+name+"_internal\\("));
 }
 assert.equal((s.match(/perform public\.hh_assert_active_setup\(\);/g)||[]).length,required.length);
});
test("guard rejects unfinished onboarding and inactive schools",()=>{
 assert.match(s,/not u\.must_change_password/);
 assert.match(s,/u\.is_active/);
 assert.match(s,/s\.is_active/);
 assert.match(s,/where u\.id=\(select auth\.uid\(\)\)/);
 assert.match(s,/using errcode='42501'/);
 assert.match(s,/revoke all on function public\.hh_assert_active_setup\(\) from public,anon,authenticated/);
});
test("dollar-quoted wrapper SQL is syntactically paired",()=>{
 assert.equal((s.match(/\$guard\$/g)||[]).length,required.length*2);
 assert.equal((s.match(/\$active\$/g)||[]).length,2);
 assert.match(s,/^begin;/m);assert.match(s,/^commit;/m);
});

test("school contact details are not exposed to arbitrary student/parent accounts",()=>{
 assert.match(s,/drop policy if exists "users can read profiles in their own school"/);
 assert.match(s,/create policy "school staff can read profiles in their own school"/);
 assert.match(s,/\('ADMIN','PRINCIPAL','VICE_PRINCIPAL','TEACHER','ACCOUNTANT'\)/);
});
test("audit entries cannot impersonate other actors or cross school boundaries",()=>{
 assert.match(s,/drop policy if exists "any authenticated school member can write an audit entry"/);
 assert.match(s,/user_id = \(select auth\.uid\(\)\)/);
 assert.match(s,/school_id = \(select public\.current_user_school_id\(\)\)/);
});
