import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=(p:string)=>readFileSync(p,"utf8");
const migration=read("supabase/migrations/0019_primary_admin_and_guarded_operational_reset.sql");
const api=read("app/api/admin/platform-control/reset/route.ts");
const page=read("app/admin/platform-control/page.tsx");
const owner=read("lib/platform/owner.ts");

test("Initial immutable PRIMARY administrator is Super Admin; co-admins denied",()=>{
 assert.match(owner,/session\.profile\.admin_tier==="PRIMARY"/);
 assert.match(owner,/session\.profile\.role==="ADMIN"/);
 assert.match(owner,/count===1/);
 assert.match(owner,/isVerifiedPlatformOwner/);
 assert.match(migration,/hh_one_primary_admin_per_school/);
 assert.match(migration,/HAVING count\(\*\)<>1/);
 assert.match(migration,/v_owner_count<>1/);
 assert.match(migration,/u\.id=p_actor/);
 assert.match(migration,/u\.admin_tier='PRIMARY'/);
});
test("Reset is opt-in, owner-only, same-origin and requires verified backup attestation",()=>{
 assert.match(api,/await requirePlatformOwner\(\)/);
 assert.match(api,/PLATFORM_ENABLE_OPERATIONAL_RESET/);
 assert.match(api,/origin!==new URL\(request\.url\)\.origin/);
 assert.match(api,/backupRestoredAndVerified:z\.literal\(true\)/);
 assert.match(api,/acknowledgePermanentDeletion:z\.literal\(true\)/);
 assert.match(api,/expectedCounts:z\.record\(z\.number\(\)\.int\(\)\.nonnegative\(\)\)/);
 assert.match(api,/RESET OPERATIONAL DATA FOR/);
 assert.match(page,/resetOperationalData/);
 assert.match(page,/Continue account cleanup/);
});
test("Reset requires maintenance and refreshed exact counts in a single scoped transaction",()=>{
 assert.match(migration,/BEGIN;/);
 assert.match(migration,/COMMIT;/);
 assert.match(migration,/pg_advisory_xact_lock/);
 assert.match(migration,/SELECT s\.name INTO v_school_name[\s\S]*FOR UPDATE/);
 assert.match(migration,/c\.paused FROM public\.platform_installation_controls/);
 assert.match(migration,/p_confirmation IS DISTINCT FROM/);
 assert.match(migration,/IF v_now<>p_expected/);
 assert.match(migration,/IF EXISTS\(SELECT 1 FROM pg_catalog\.jsonb_each_text\(v_after\)/);
 assert.match(migration,/schema_guard/);
});
test("Reset does not destroy PRIMARY, school settings, preserved branding, audit or platform controls",()=>{
 const sql=migration.replace(/--[^\n]*/g,"");
 for(const table of ["schools","audit_logs","school_media_settings",
   "platform_installation_controls","platform_reset_jobs"]){
   assert.doesNotMatch(sql,new RegExp("\\bDELETE\\s+FROM\\s+public\\."+table+"\\b","i"),table);
 }
 assert.match(migration,/DELETE FROM public\.users x WHERE x\.school_id=p_school AND x\.id<>p_actor/);
 assert.match(migration,/current_academic_session_id=NULL,current_term_id=NULL/);
 assert.doesNotMatch(sql,/\bTRUNCATE\b|\bDROP TABLE\b/i);
});
test("Operational tables are removed in correct dependency order",()=>{
 const order=[
   "hh_irregularity_events","hh_irregularity_requests",
   "result_subject_scores","class_report_entries",
   "class_subject_corrections","class_result_review_signoffs",
   "subject_markbooks","class_result_batches","results","notifications",
   "parent_students","students","parents","teacher_subject_assignments",
   "teacher_classes","class_subjects","classes","subjects","teachers",
   "terms","academic_sessions","users",
 ];
 let last=-1;
 for(const table of order){
   const pos=migration.indexOf("DELETE FROM public."+table+" ");
   assert.ok(pos>last,`Expected ordered delete for ${table}`);
   last=pos;
 }
});
test("Auth deletion is separate, resumable, school/owner scoped and cannot delete Super Admin",()=>{
 assert.match(migration,/platform_reset_jobs/);
 assert.match(migration,/pending_auth_ids/);
 assert.match(migration,/hh_platform_reset_auth_done/);
 assert.match(api,/\.eq\("primary_admin_id",session\.authUserId\)/);
 assert.match(api,/userId===session\.authUserId/);
 assert.match(api,/admin\.auth\.admin\.deleteUser\(userId\)/);
 assert.match(api,/pending_auth_ids\.slice\(0,12\)/);
 const pause=read("app/api/admin/platform-control/route.ts");
 assert.match(pause,/Finish deleting old sign-in accounts before resuming/);
});
