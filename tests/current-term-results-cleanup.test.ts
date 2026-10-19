import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const preview=readFileSync("supabase/maintenance/preview_current_term_results_cleanup.sql","utf8");
const cleanup=readFileSync("supabase/maintenance/cleanup_current_term_results_GUARDED.sql","utf8");

const targets=[
 "subject_markbooks","class_result_batches","results",
 "result_subject_scores","class_subject_corrections",
 "class_result_review_signoffs","class_report_entries"
];

test("Preview is read-only and includes all seven current term result datasets",()=>{
 for (const table of targets) assert.match(preview,new RegExp("public\\."+table+"\\b"));
 const sql=preview.replace(/--[^\n]*/g,"");
 assert.doesNotMatch(sql,/\b(?:DELETE|TRUNCATE|INSERT|UPDATE|DROP|ALTER|CREATE|COMMIT)\b/i);
 assert.match(sql,/scope_consistent/);
 assert.match(sql,/published_or_hidden_results/);
 assert.match(sql,/released_or_legacy_batches/);
});

test("Cleanup requires explicit school, term, session, count and deletion confirmation",()=>{
 for(const table of targets) assert.match(cleanup,new RegExp("public\\."+table+"\\b"));
 assert.match(cleanup,/v_school_id uuid := '00000000-0000-0000-0000-000000000000'/);
 assert.match(cleanup,/v_expected_session_id uuid := '00000000-0000-0000-0000-000000000000'/);
 assert.match(cleanup,/v_expected_term_id uuid := '00000000-0000-0000-0000-000000000000'/);
 assert.match(cleanup,/v_confirmation <> 'DELETE_THIS_SCHOOL_CURRENT_TERM_RESULTS'/);
 assert.match(cleanup,/v_publication_confirmation <> 'DELETE_EXISTING_PUBLICATIONS_TOO'/);
 assert.match(cleanup,/v_count_results <> v_expected_results/);
 assert.match(cleanup,/v_count_markbooks <> v_expected_markbooks/);
 assert.match(cleanup,/v_count_batches <> v_expected_batches/);
});

test("Cleanup defaults to rollback and isolates every destructive statement",()=>{
 const uncommented=cleanup.replace(/--[^\n]*/g,"");
 assert.match(uncommented,/\bBEGIN\s*;/i);
 assert.match(uncommented,/\bROLLBACK\s*;\s*$/i);
 assert.doesNotMatch(uncommented,/\bCOMMIT\s*;/i);
 assert.doesNotMatch(uncommented,/\bTRUNCATE\b/i);
 assert.doesNotMatch(uncommented,/\bDROP\b/i);
 const lines=uncommented.split("\n").filter(l=>/\bDELETE\s+FROM\s+public\./i.test(l));
 assert.deepEqual(lines.map(l=>l.match(/DELETE\s+FROM\s+public\.([a-z_]+)/i)?.[1]),
  ["class_result_review_signoffs","class_subject_corrections","class_report_entries",
   "result_subject_scores","results","class_result_batches","subject_markbooks"]);
 for(const name of [
  "class_result_review_signoffs","class_subject_corrections","class_report_entries",
  "results","class_result_batches","subject_markbooks"
 ]) {
  assert.match(uncommented,new RegExp("DELETE FROM public\\."+name+"[\\s\\S]*?WHERE school_id=v_school_id AND term_id=v_expected_term_id"));
 }
 assert.match(uncommented,/r\.school_id=v_school_id AND r\.term_id=v_expected_term_id/);
});

test("Abort on unexpected dependencies and preserve school structure",()=>{
 assert.match(cleanup,/Unexpected dependent foreign keys/);
 assert.match(cleanup,/pg_catalog\.pg_advisory_xact_lock/);
 assert.match(cleanup,/FOR UPDATE/);
 assert.match(cleanup,/Post-cleanup validation failed/);
 const uncomments=cleanup.replace(/--[^\n]*/g,"");
 for(const table of ["schools","users","teachers","students","classes","subjects",
  "academic_sessions","terms","audit_logs","notifications"]){
  assert.doesNotMatch(uncomments,new RegExp("(?:DELETE|TRUNCATE)\\s+(?:FROM\\s+)?public\\."+table+"\\b","i"));
 }
});
