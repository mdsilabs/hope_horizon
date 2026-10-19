import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const sql=readFileSync("supabase/migrations/0016_class_teacher_irregularity_requests.sql","utf8");
const api=readFileSync("app/api/teacher/irregularities/route.ts","utf8");
const ui=readFileSync("app/teacher/irregularities/page.tsx","utf8");
const classes=readFileSync("app/teacher/classes/page.tsx","utf8");
const docs=readFileSync("docs/TEACHER_IRREGULARITY_REQUESTS.md","utf8");

test("Migration 0016 retains strict teacher school and class scope",()=>{
  assert.match(sql,/CREATE OR REPLACE FUNCTION public\.hh_submit_irregularity/);
  assert.match(sql,/u\.role='TEACHER'/);
  assert.match(sql,/t\.user_id=auth\.uid\(\) AND t\.school_id=v_school AND t\.is_active/);
  assert.match(sql,/IF NOT v_own_class AND NOT EXISTS/);
  assert.match(sql,/v_count<>1/);
  assert.match(sql,/public\.class_subjects cs/);
  assert.match(sql,/sub\.school_id=v_school AND sub\.is_active/);
  assert.match(sql,/st\.class_id=p_class_id AND st\.is_active/);
  assert.match(sql,/v_status:=CASE WHEN v_class_teacher=auth\.uid\(\)/);
  assert.match(sql,/THEN 'PENDING_ADMIN' ELSE 'PENDING_CLASS_TEACHER'/);
  assert.doesNotMatch(sql,/\bUPDATE public\.(?:results|subject_markbooks|students)\b/i);
  assert.doesNotMatch(sql,/\bDELETE FROM public\.(?:results|subject_markbooks|students)\b/i);
});
test("Class teachers can propose marks for any attached active class subject",()=>{
  assert.match(sql,/NOT v_own_class AND NOT EXISTS\(/);
  assert.match(sql,/public\.teacher_subject_assignments a/);
  assert.match(sql,/sub\.school_id=v_school AND sub\.is_active/);
  assert.match(api,/db\.from\("class_subjects"\)/);
  assert.match(api,/\.in\("class_id",ownClassIds\)/);
  assert.match(api,/classTeacherReady:userIds\.length===1/);
  assert.match(api,/isClassTeacher:ownClassIds\.includes\(c\.id\)/);
  assert.match(api,/subjects:Array\.from\(new Map/);
});
test("Self request never routes back to the class teacher for self approval",()=>{
  assert.match(ui,/cls\.isClassTeacher\?"school administrator":cls\.classTeacherName/);
  assert.match(ui,/cls\?\.isClassTeacher\?"School administrator"/);
  assert.match(ui,/cls\?\.isClassTeacher\?"administrator"/);
  assert.match(ui,/Class teacher: \{cls\.classTeacherName\}/);
  assert.match(sql,/v_status:=CASE WHEN v_class_teacher=auth\.uid\(\)/);
  assert.match(classes,/\/teacher\/irregularities\?classId=/);
  assert.match(ui,/new URLSearchParams\(window\.location\.search\)/);
  assert.match(docs,/0016_class_teacher_irregularity_requests\.sql/);
});
