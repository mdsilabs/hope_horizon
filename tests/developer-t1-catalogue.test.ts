/**
 * Hope Horizon test catalogue: developer-only (T1) automated subset.
 * This deliberately does not claim Supabase, SMTP, WhatsApp, PDF,
 * staging-browser, recovery or load tests were executed.
 * Exact catalogue cases involving save/reload are unit-level checks here
 * and still need separate integration execution.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {computeSubjectScore,computeOverall,computeClassPositions,resolveGrade}
  from "../services/gradingService";
import {markbookSaveSchema} from "../lib/validations/compilation";
import {resultSchema} from "../lib/validations/result";
const id="550e8400-e29b-41d4-a716-446655440000";
const gradeScale=[
  {minScore:0,maxScore:49,grade:"F"},
  {minScore:50,maxScore:69,grade:"C"},
  {minScore:70,maxScore:100,grade:"A"},
];
const mark=(ca:number,exam:number)=>({
 classId:id,subjectId:id,termId:id,submit:false,
 scores:[{studentId:id,ca,exam}]
});
test("TP07-TC01 numeric computation: CA 18 + Exam 55 = 73",()=>{
 assert.equal(computeSubjectScore(18,55,gradeScale).total,73);
});
test("TP07-TC02 zero is a real score and total zero",()=>{
 assert.equal(markbookSaveSchema.safeParse(mark(0,0)).success,true);
 assert.equal(computeSubjectScore(0,0,gradeScale).total,0);
});
test("TP07-TC04 rejects negative CA in markbook schema",()=>{
 assert.equal(markbookSaveSchema.safeParse(mark(-1,55)).success,false);
});
test("TP07-TC07 and TP07-TC08 grade thresholds in test grading scale",()=>{
 assert.equal(resolveGrade(69,gradeScale),"C");
 assert.equal(resolveGrade(70,gradeScale),"A");
});
test("TP07-TC09 mean(60,70,80) = 70.00",()=>{
 assert.deepEqual(computeOverall([{total:60},{total:70},{total:80}]),
   {overallTotal:210,overallAverage:70});
});
test("TP07-TC10 distinct positions assigned 1 2 3",()=>{
 assert.deepEqual(computeClassPositions([
  {resultId:"A",overallTotal:85},{resultId:"B",overallTotal:95},
  {resultId:"C",overallTotal:70}
 ]),{B:1,A:2,C:3});
});
test("TP07-TC11 ties use competition ranking 1 2 2 4",()=>{
 assert.deepEqual(computeClassPositions([
  {resultId:"A",overallTotal:90},{resultId:"B",overallTotal:80},
  {resultId:"C",overallTotal:80},{resultId:"D",overallTotal:70},
 ]),{A:1,B:2,C:2,D:4});
});
test("TP07-TC13 computed averages round to two decimals",()=>{
 assert.deepEqual(computeOverall([{total:80},{total:81},{total:90}]),
   {overallTotal:251,overallAverage:83.67});
});
test("TP07-TC14 empty scores cause no arithmetic exception (display-state unverified)",()=>{
 assert.deepEqual(computeOverall([]),{overallTotal:0,overallAverage:0});
});
test("TP07-TC06 DOCUMENTED DEFECT: legacy resultSchema coerces blank CA to zero",()=>{
 const base={studentId:id,classId:id,academicSessionId:id,termId:id,
   subjects:[{subjectId:id,ca:"",exam:55}]};
 const parsed=resultSchema.safeParse(base);
 // Guard this finding against accidental misreporting as a functional pass.
 assert.equal(parsed.success,true,"If this becomes false, blank-to-zero defect has been fixed");
 if(parsed.success)assert.equal(parsed.data.subjects[0]?.ca,0);
});
test("TP14-TC04 schema defines one result per student session term",()=>{
 const s=readFileSync("supabase/migrations/0001_init.sql","utf8");
 assert.match(s,/unique\s*\(student_id,\s*academic_session_id,\s*term_id\)/);
 assert.match(s,/unique\s*\(result_id,\s*subject_id\)/);
});
test("TP15-TC03 user-supplied roles denied in class workflow schema",()=>{
 assert.equal(markbookSaveSchema.safeParse({...mark(30,55),role:"ADMIN"}).success,false);
});
test("TP15-TC07 direct markbook schema rejects invalid numeric bounds",()=>{
 assert.equal(markbookSaveSchema.safeParse(mark(-2,40)).success,false);
 assert.equal(markbookSaveSchema.safeParse(mark(110,40)).success,false);
 assert.equal(markbookSaveSchema.safeParse(mark(30,120)).success,false);
});
