import test from "node:test";
import assert from "node:assert/strict";
import {classReviewActionSchema} from "../lib/validations/class-review";
import {readFileSync} from "node:fs";
const id="550e8400-e29b-41d4-a716-446655440000";
test("Class teacher correction demands a meaningful reason",()=>{
  assert.equal(classReviewActionSchema.safeParse({action:"REQUEST_CORRECTION",subjectId:id,reason:"Check Mathematics CA"}).success,true);
  assert.equal(classReviewActionSchema.safeParse({action:"REQUEST_CORRECTION",subjectId:id,reason:"x"}).success,false);
  assert.equal(classReviewActionSchema.safeParse({action:"REQUEST_CORRECTION",subjectId:id,reason:"Check marks",schoolId:id}).success,false);
});
test("Clearing a correction and signing off require strict actions",()=>{
  assert.equal(classReviewActionSchema.safeParse({action:"CLEAR_CORRECTION",requestId:id}).success,true);
  assert.equal(classReviewActionSchema.safeParse({action:"SIGN_OFF"}).success,true);
  assert.equal(classReviewActionSchema.safeParse({action:"SIGN_OFF",override:true}).success,false);
});
test("Review SQL guards compilation and preserves transactional correction routing",()=>{
  const sql=readFileSync("supabase/migrations/0010_class_review_signoff.sql","utf8");
  for(const fn of ["hh_request_subject_correction","hh_clear_subject_correction","hh_signoff_class_review","hh_guard_compilation_review"]){
    assert.match(sql,new RegExp("create or replace function public\\."+fn));
  }
  for(const tag of ["invalidate","request","clear","signoff","guard"]){
    assert.equal(sql.split("$"+tag+"$").length-1,2,tag+" function should have paired dollar quotes");
  }
  assert.match(sql,/hh_require_review_before_compilation/);
  assert.match(sql,/hh_marks_invalidate_class_review/);
  assert.match(sql,/and r\.reviewed_by=new\.compiled_by/);
});
