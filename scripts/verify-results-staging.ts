/**
 * One-shot STAGING DB workflow smoke test. Intentionally exercises real
 * authenticated PostgREST RPCs, never privileged SQL shortcuts.
 * Run only after QA staging migration and seed-results-staging.ts.
 */
import "dotenv/config";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
const value = (name:string) => {
 const v=process.env[name];if(!v)throw Error(`Missing ${name}`);return v;
};
const url=value("STAGING_SUPABASE_URL");
const ref=new URL(url).hostname.split(".")[0];
if(process.env.ALLOW_STAGING_SEED!=="true" || ref!==value("EXPECTED_STAGING_PROJECT_REF") ||
   ref==="iwfpdwihinhcwjgvmfei") throw Error("Dedicated isolated staging project required.");
const password=value("STAGING_TEST_PASSWORD");
const publicKey=value("STAGING_SUPABASE_PUBLISHABLE_KEY");
const secret=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!secret)throw Error("Missing staging service credential for read-only fixture discovery.");
const adminDb=createClient(url,secret,{auth:{autoRefreshToken:false,persistSession:false}});
async function login(email:string){
 const db=createClient(url,publicKey,{auth:{autoRefreshToken:false,persistSession:false}});
 const {error}=await db.auth.signInWithPassword({email,password});
 if(error)throw Error(`Login failed (${email}): ${error.message}`);
 return db;
}
async function run(){
 const {data:schools,error:schoolError}=await adminDb.from("schools").select("id,current_term_id")
   .eq("name","Hope Horizon QA STAGING");
 assert.ifError(schoolError);
 assert.equal(schools?.length,1);
 const schoolId=schools![0].id,termId=schools![0].current_term_id;
 const {data:classes}=await adminDb.from("classes").select("id").eq("school_id",schoolId);
 assert.equal(classes?.length,1);const classId=classes![0].id;
 const {data:students}=await adminDb.from("students").select("id").eq("school_id",schoolId).order("admission_number");
 const {data:subjects}=await adminDb.from("subjects").select("id,code").eq("school_id",schoolId).order("code");
 assert.equal(students?.length,10);assert.equal(subjects?.length,5);
 const ids=students!.map(s=>s.id);
 const principal=await login("qa.principal@example.test");
 const classTeacher=await login("qa.class.teacher@example.test");
 const administrator=await login("qa.admin@example.test");
 const student=await login("qa.student.01@example.test");
 const parent=await login("qa.parent.01@example.test");
 const scores=(subjectIndex:number,correction=false)=>ids.map((studentId,i)=>({
   studentId,ca:25+((i+subjectIndex)%12)+(correction&&i===0?1:0),
   exam:40+((i+subjectIndex)%15)
 }));
 const subjectClients=new Map<string,ReturnType<typeof createClient>>();
 // All five subject teachers use their own Auth sessions.
 for(const [index,sub] of subjects!.entries()){
   const db=await login(`qa.teacher.${sub.code.toLowerCase()}@example.test`);
   subjectClients.set(sub.id,db);
   const {data,error}=await db.rpc("hh_save_subject_markbook",{
     p_class_id:classId,p_subject_id:sub.id,p_term_id:termId,
     p_scores:scores(index),p_submit:true
   });
   if(error)throw Error(`Subject ${sub.code} save: ${error.message}`);
   assert.equal(data,10);
   console.log(`PASS subject entry: ${sub.code}`);
 }
 // Return one submitted subject to its teacher, then clear only after resubmission.
 const first=subjects![0];
 const {data:requestId,error:correctionError}=await classTeacher.rpc("hh_request_subject_correction",{
   p_class_id:classId,p_subject_id:first.id,p_term_id:termId,
   p_reason:"Please correct the first pupil's CA mark"
 });
 if(correctionError || !requestId)throw Error(`Correction request: ${correctionError?.message}`);
 const {error:beforeClear}=await classTeacher.rpc("hh_clear_subject_correction",{p_request_id:requestId});
 assert.ok(beforeClear,"Clearing an unresolved correction before resubmission must fail");
 const {error:resubmitError}=await subjectClients.get(first.id)!.rpc("hh_save_subject_markbook",{
   p_class_id:classId,p_subject_id:first.id,p_term_id:termId,
   p_scores:scores(0,true),p_submit:true
 });
 if(resubmitError)throw Error(`Correction resubmit: ${resubmitError.message}`);
 const {error:clearError}=await classTeacher.rpc("hh_clear_subject_correction",{p_request_id:requestId});
 if(clearError)throw Error(`Clear correction: ${clearError.message}`);
 console.log("PASS correction request → resubmit → clear");
 const {data:entryCount,error:entryError}=await classTeacher.rpc("hh_save_class_report_entries",{
   p_class_id:classId,p_term_id:termId,
   p_entries:ids.map((studentId,i)=>({studentId,present:69+i%3,absent:3-i%3,totalDays:72,
     remark:"Good participation and satisfactory progress."}))
 });
 if(entryError)throw Error(`Attendance: ${entryError.message}`);
 assert.equal(entryCount,10);
 const {data:signed,error:signError}=await classTeacher.rpc("hh_signoff_class_review",{
   p_class_id:classId,p_term_id:termId
 });
 if(signError)throw Error(`Sign-off: ${signError.message}`);
 assert.equal(signed,50);console.log("PASS attendance and class sign-off");
 const {data:compiled,error:compileError}=await classTeacher.rpc("hh_compile_class_results",{
   p_class_id:classId,p_term_id:termId
 });
 if(compileError)throw Error(`Compile: ${compileError.message}`);
 assert.equal(compiled,10);console.log("PASS class compilation");
 const {data:batches}=await adminDb.from("class_result_batches").select("id")
   .eq("school_id",schoolId).eq("class_id",classId).eq("term_id",termId);
 assert.equal(batches?.length,1);const batchId=batches![0].id;
 const {data:decision,error:decisionError}=await principal.rpc("hh_head_decide_class_batch",{
   p_batch_id:batchId,p_action:"APPROVE",p_remarks:"Verified for QA release"
 });
 if(decisionError)throw Error(`Approval: ${decisionError.message}`);
 assert.equal(decision,true);console.log("PASS principal approval");
 const {data:published,error:pubError}=await principal.rpc("hh_release_class_batch",{
   p_batch_id:batchId,p_action:"PUBLISH"
 });
 if(pubError)throw Error(`Publish: ${pubError.message}`);
 assert.equal(published,10);console.log("PASS atomic publication");
 const publishedStudent=await student.from("results").select("id").eq("class_id",classId).eq("term_id",termId);
 const publishedParent=await parent.from("results").select("id").eq("class_id",classId).eq("term_id",termId);
 assert.ifError(publishedStudent.error);assert.ifError(publishedParent.error);
 assert.equal(publishedStudent.data?.length,1);
 assert.equal(publishedParent.data?.length,1);
 console.log("PASS student/parent isolation after publication");
 const {data:withdrawn,error:withdrawError}=await administrator.rpc("hh_release_class_batch",{
   p_batch_id:batchId,p_action:"WITHDRAW"
 });
 if(withdrawError)throw Error(`Withdraw: ${withdrawError.message}`);
 assert.equal(withdrawn,10);
 const afterStudent=await student.from("results").select("id").eq("class_id",classId).eq("term_id",termId);
 const afterParent=await parent.from("results").select("id").eq("class_id",classId).eq("term_id",termId);
 assert.ifError(afterStudent.error);assert.ifError(afterParent.error);
 assert.equal(afterStudent.data?.length,0);assert.equal(afterParent.data?.length,0);
 console.log("PASS withdrawal hides all results from families");
 console.log("STAGING RESULT WORKFLOW: ALL ASSERTIONS PASSED");
}
run().catch(e=>{console.error("STAGING QA FAILED:",e instanceof Error?e.message:e);process.exitCode=1;});
