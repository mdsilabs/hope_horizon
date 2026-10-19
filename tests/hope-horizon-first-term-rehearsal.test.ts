import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const sql=readFileSync("supabase/maintenance/HOPE_HORIZON_2026_2027_FIRST_TERM_REHEARSAL.sql","utf8");
test("First Term rehearsal uses exact previewed school, session and term",()=>{
 for(const item of [
 "146b7b86-4cf7-46da-b12a-52f18a6da4bc",
 "2158a437-c420-47ef-bf2c-583489a1d042",
 "7c365598-9303-4747-82fe-364861977a65",
 "v_expected_results bigint := 10;",
 "v_expected_markbooks bigint := 50;",
 "v_expected_batches bigint := 1;",
 ])assert.ok(sql.includes(item), `Missing scoped preview value: ${item}`);
});
test("Publication and deletion confirmations remain OFF and the transaction always rolls back",()=>{
 assert.match(sql,/v_confirmation text := 'NOT_CONFIRMED'/);
 assert.match(sql,/v_publication_confirmation text := 'NOT_CONFIRMED'/);
 assert.match(sql,/v_publication_confirmation <> 'DELETE_EXISTING_PUBLICATIONS_TOO'/);
 assert.match(sql,/v_confirmation <> 'DELETE_THIS_SCHOOL_CURRENT_TERM_RESULTS'/);
 assert.match(sql,/\bBEGIN;/);
 assert.match(sql,/\bROLLBACK;\s*$/);
 assert.doesNotMatch(sql.replace(/--[^\n]*/g,""),/\bCOMMIT\s*;/);
});
test("First Term cleanup preserves identity and academic structure",()=>{
 const active=sql.replace(/--[^\n]*/g,"");
 for (const name of ["students","teachers","classes","subjects","schools","terms","users","audit_logs","notifications","academic_sessions"]){
   assert.doesNotMatch(active,new RegExp("\\b(?:DELETE\\s+FROM|TRUNCATE)\\s+public\\."+name+"\\b","i"));
 }
 assert.match(sql,/v_actual_term IS DISTINCT FROM v_expected_term_id/);
 assert.match(sql,/v_count_published > 0 OR v_count_released > 0/);
});
