import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
  submitIrregularitySchema,parseScoreInput,validateScoreLimits,
  classIrregularityDecisionSchema,adminIrregularityDecisionSchema,
} from "../lib/validations/irregularities";

const uuid="550e8400-e29b-41d4-a716-446655440000";
const base={kind:"ADD_STUDENT" as const,classId:uuid,termId:uuid,
  fullName:"Mary O'Connor",admissionNumber:"HH/2026-017",
  reason:"Student's examination admission was omitted."};
const edit={kind:"EDIT_MARK" as const,classId:uuid,termId:uuid,subjectId:uuid,
  studentId:uuid,ca:20.25,exam:48.5,reason:"The recorded CA and exam scores are incorrect."};

test("Unicode names are allowed, whitespace is trimmed, forged fields and bad IDs are rejected",()=>{
  const valid=submitIrregularitySchema.safeParse({...base,fullName:"  Amina Ọlá  "});
  assert.equal(valid.success,true);
  if(valid.success)assert.equal(valid.data.fullName,"Amina Ọlá");
  for(const fullName of ["","X","Test <script>","Jane\nDoe","🙂🙂"])
    assert.equal(submitIrregularitySchema.safeParse({...base,fullName}).success,false,fullName);
  for(const admissionNumber of ["","  ","#?","HH@/2026","HH\nB"])
    assert.equal(submitIrregularitySchema.safeParse({...base,admissionNumber}).success,false,admissionNumber);
  assert.equal(submitIrregularitySchema.safeParse({...base,classId:"not-a-uuid"}).success,false);
  assert.equal(submitIrregularitySchema.safeParse({...base,approved:true}).success,false);
});
test("Reason must be meaningful and length-limited",()=>{
  assert.equal(submitIrregularitySchema.safeParse({...base,reason:"  blank   "}).success,false);
  assert.equal(submitIrregularitySchema.safeParse({...base,reason:"x".repeat(1001)}).success,false);
  assert.equal(submitIrregularitySchema.safeParse(base).success,true);
});
test("Blank or malicious numeric values never become zero",()=>{
  for(const value of ["", " ","1e2","NaN","Infinity","2abc","10,5","1.000","-1","1000"])
    assert.equal(parseScoreInput(value),null,value);
  assert.equal(parseScoreInput("0"),0);
  assert.equal(parseScoreInput("0.00"),0);
  assert.equal(parseScoreInput("38.25"),38.25);
  assert.equal(parseScoreInput("100.00"),100);
});
test("Mark schema restricts range, finite values, type and precision",()=>{
  assert.equal(submitIrregularitySchema.safeParse(edit).success,true);
  for(const ca of [100.001,10.123,Number.NaN,Number.POSITIVE_INFINITY,-0.01,101]){
    assert.equal(submitIrregularitySchema.safeParse({...edit,ca}).success,false,String(ca));
  }
  assert.equal(submitIrregularitySchema.safeParse({...edit,ca:"20"}).success,false);
  assert.equal(submitIrregularitySchema.safeParse({...edit,studentId:""}).success,false);
  assert.equal(submitIrregularitySchema.safeParse({...edit,subjectId:""}).success,false);
});
test("Actual school subject limits override generic score bounds",()=>{
  assert.deepEqual(validateScoreLimits(30,55,40,60),{});
  assert.equal(validateScoreLimits(41,55,40,60).ca,"CA must not exceed 40.");
  assert.equal(validateScoreLimits(30,61,40,60).exam,"Exam must not exceed 60.");
  assert.ok(validateScoreLimits(30,50,Number.NaN,60).ca);
});
test("Approvers cannot reject without a reason and cannot send oversized notes",()=>{
  for(const schema of [classIrregularityDecisionSchema,adminIrregularityDecisionSchema]){
    const reject=schema===classIrregularityDecisionSchema?"REJECT":"REJECT";
    assert.equal(schema.safeParse({action:reject,note:"    "}).success,false);
    assert.equal(schema.safeParse({action:reject,note:"10 letters!"}).success,true);
    assert.equal(schema.safeParse({action:reject,note:"x".repeat(1001)}).success,false);
  }
});
test("Teacher and admin forms use schema and inline accessible field errors",()=>{
  const teacher=readFileSync("app/teacher/irregularities/page.tsx","utf8");
  const admin=readFileSync("app/admin/irregularities/page.tsx","utf8");
  const api=readFileSync("app/api/teacher/irregularities/route.ts","utf8");
  const migration=readFileSync("supabase/migrations/0017_irregularity_input_validation.sql","utf8");
  assert.match(teacher,/submitIrregularitySchema\.safeParse\(draft\)/);
  assert.match(teacher,/parseScoreInput\(ca\)/);
  assert.doesNotMatch(teacher,/ca:Number\(ca\)|exam:Number\(exam\)/);
  assert.match(teacher,/aria-invalid/);
  assert.match(teacher,/role="alert"/);
  assert.match(teacher,/validateScoreLimits/);
  assert.match(teacher,/setFieldErrors\(next\)/);
  assert.match(teacher,/classIrregularityDecisionSchema\.safeParse/);
  assert.match(admin,/adminIrregularityDecisionSchema\.safeParse/);
  assert.match(admin,/decisionErrors\[r\.id\]/);
  assert.match(api,/ca_max_score_override/);
  assert.match(api,/exam_max_score_override/);
  assert.match(api,/submitIrregularitySchema\.parse\(await request\.json\(\)\)/);
  assert.match(migration,/v_score_ca\*100<>trunc\(v_score_ca\*100\)/);
  assert.match(migration,/v_score_exam\*100<>trunc\(v_score_exam\*100\)/);
  assert.doesNotMatch(migration,/UPDATE public\.results|UPDATE public\.subject_markbooks/);
});
