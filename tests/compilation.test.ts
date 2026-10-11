import test from "node:test";
import assert from "node:assert/strict";
import {markbookSaveSchema,classCompileSchema,batchDecisionSchema} from "../lib/validations/compilation";
import {readFileSync} from "node:fs";
const id="550e8400-e29b-41d4-a716-446655440000";
test("subject submission cannot forge school/role or duplicate students",()=>{
  const val={classId:id,subjectId:id,termId:id,submit:true,
    scores:[{studentId:id,ca:30,exam:55}]};
  assert.equal(markbookSaveSchema.safeParse(val).success,true);
  assert.equal(markbookSaveSchema.safeParse({...val,schoolId:id}).success,false);
  assert.equal(markbookSaveSchema.safeParse({...val,scores:[...val.scores,...val.scores]}).success,false);
  assert.equal(markbookSaveSchema.safeParse({...val,scores:[{studentId:id,ca:41,exam:-2}]}).success,false);
});
test("class teacher compiles assigned class and cannot select school",()=>{
  assert.equal(classCompileSchema.safeParse({classId:id,termId:id}).success,true);
  assert.equal(classCompileSchema.safeParse({classId:id,termId:id,role:"PRINCIPAL"}).success,false);
});
test("head cannot return class without correction reason",()=>{
  assert.equal(batchDecisionSchema.safeParse({action:"RETURN",remarks:""}).success,false);
  assert.equal(batchDecisionSchema.safeParse({action:"RETURN",remarks:"Verify maths marks"}).success,true);
});
test("SQL registers subject, class and head transactional RPCs",()=>{
  const sql=readFileSync("supabase/migrations/0009_subject_class_compilation.sql","utf8");
  for(const fn of ["hh_save_subject_markbook","hh_compile_class_results","hh_head_decide_class_batch"]){
    assert.match(sql,new RegExp("create or replace function public\\."+fn));
  }
  assert.match(sql,/jsonb_to_recordset/);
  assert.match(sql,/Some subject teachers have not submitted marks/);
  assert.match(sql,/The class compilation contains inconsistent result states/);
});

test("Migration 0009 uses paired named PostgreSQL function delimiters",()=>{
  const sql=readFileSync("supabase/migrations/0009_subject_class_compilation.sql","utf8");
  for(const tag of ["markbook","compile","decide"]){
    const token="$"+tag+"$";
    assert.equal(sql.split(token).length-1,2,"Expected paired delimiter "+token);
  }
  assert.match(sql,/grading scale does not cover some entered totals/i);
});
