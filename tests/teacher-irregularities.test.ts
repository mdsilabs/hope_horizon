import test from "node:test";
import assert from "node:assert/strict";
import {existsSync,readFileSync} from "node:fs";
import {submitIrregularitySchema,classIrregularityDecisionSchema,adminIrregularityDecisionSchema}
 from "../lib/validations/irregularities";

const id="550e8400-e29b-41d4-a716-446655440000";
const sql=readFileSync("supabase/migrations/0015_teacher_irregularity_requests.sql","utf8");
const teacher=readFileSync("app/api/teacher/irregularities/route.ts","utf8");
const admin=readFileSync("app/api/admin/irregularities/route.ts","utf8");
const classReview=readFileSync("app/api/teacher/irregularities/[id]/review/route.ts","utf8");
const adminReview=readFileSync("app/api/admin/irregularities/[id]/decision/route.ts","utf8");
const teacherUI=readFileSync("app/teacher/irregularities/page.tsx","utf8");
const adminUI=readFileSync("app/admin/irregularities/page.tsx","utf8");
const sidebar=readFileSync("components/layout/Sidebar.tsx","utf8");

test("Teacher can request student addition or specific score correction with strict validation",()=>{
  const add={kind:"ADD_STUDENT",classId:id,termId:id,fullName:"New Student",
    admissionNumber:"HH-251",reason:"Admission record was missing after verification."};
  assert.equal(submitIrregularitySchema.safeParse(add).success,true);
  assert.equal(submitIrregularitySchema.safeParse({...add,adminApproved:true}).success,false);
  assert.equal(submitIrregularitySchema.safeParse({...add,reason:"oops"}).success,false);
  const edit={kind:"EDIT_MARK",classId:id,termId:id,subjectId:id,studentId:id,
    ca:25,exam:60,reason:"Examination script was misentered in the markbook."};
  assert.equal(submitIrregularitySchema.safeParse(edit).success,true);
  assert.equal(submitIrregularitySchema.safeParse({...edit,exam:101}).success,false);
  assert.equal(submitIrregularitySchema.safeParse({...edit,status:"PUBLISHED"}).success,false);
});
test("Different class-teacher and administrator approval actions are validated",()=>{
 assert.equal(classIrregularityDecisionSchema.safeParse({action:"ENDORSE"}).success,true);
 assert.equal(classIrregularityDecisionSchema.safeParse({action:"REJECT",note:"Not enough evidence"}).success,true);
 assert.equal(classIrregularityDecisionSchema.safeParse({action:"REJECT",note:"No"}).success,false);
 assert.equal(adminIrregularityDecisionSchema.safeParse({action:"APPROVE"}).success,true);
 assert.equal(adminIrregularityDecisionSchema.safeParse({action:"REJECT",note:"Need another signed source"}).success,true);
 assert.equal(adminIrregularityDecisionSchema.safeParse({action:"ENDORSE"}).success,false);
});
test("Database owns all sensitive writes and guards school/role/class/subject",()=>{
 for(const s of ["SECURITY DEFINER SET search_path=''","auth.uid()","class_teacher_id",
   "public.teacher_classes","public.teacher_subject_assignments","public.current_user_school_id()",
   "PENDING_CLASS_TEACHER","PENDING_ADMIN","APPROVED_PENDING_APPLICATION",
   "hh_irregularity_events","hh_submit_irregularity","hh_class_review_irregularity",
   "hh_admin_review_irregularity","FOR UPDATE", "hh_irregularity_recipient"]){
  assert.ok(sql.includes(s),s);
 }
 assert.match(sql,/REVOKE INSERT,UPDATE,DELETE/);
 assert.match(sql,/v_class_teacher=auth\.uid\(\)/);
 assert.match(sql,/v_request\.requester_id=auth\.uid\(\)/);
 assert.match(sql,/v_count<>1/);
 assert.doesNotMatch(sql,/\bUPDATE public\.(?:results|students|subject_markbooks)\b/i);
 assert.doesNotMatch(sql,/\bDELETE FROM public\.(?:results|subject_markbooks)\b/i);
});
test("API routes use only authenticated restricted RPCs for decisions",()=>{
 assert.match(teacher,/requireRole\(\["TEACHER"\]\)/);
 assert.match(teacher,/hh_submit_irregularity/);
 assert.match(teacher,/classTeacherName/);
 assert.match(teacher,/events/);
 assert.match(classReview,/hh_class_review_irregularity/);
 assert.match(classReview,/requireRole\(\["TEACHER"\]\)/);
 assert.match(adminReview,/hh_admin_review_irregularity/);
 assert.match(adminReview,/requireRole\(\["ADMIN"\]\)/);
 assert.match(admin,/\.eq\("school_id",schoolId\)/);
});
test("Teacher sees name, progress and class-teacher review; Admin sees queue",()=>{
 assert.match(teacherUI,/Assigned class teacher:/);
 assert.match(teacherUI,/Progress history/);
 assert.match(teacherUI,/classTeacherName/);
 assert.match(teacherUI,/Endorse to administrator/);
 assert.match(teacherUI,/approved the request, but the student or marks have not yet been changed/i);
 assert.match(adminUI,/Approved, awaiting implementation/);
 assert.match(adminUI,/will NOT change published marks/);
 assert.match(sidebar,/href: "\/teacher\/irregularities"/);
 assert.match(sidebar,/href: "\/admin\/irregularities"/);
 assert.ok(existsSync("app/teacher/irregularities/page.tsx"));
 assert.ok(existsSync("app/admin/irregularities/page.tsx"));
});
