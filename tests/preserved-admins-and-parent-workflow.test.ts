import test from "node:test";
import assert from "node:assert/strict";
import {existsSync,readFileSync} from "node:fs";
import {parentContactSchema} from "../lib/validations/parent-contact";

const file=(p:string)=>readFileSync(p,"utf8");
const reset=file("supabase/migrations/0020_preserve_all_admins_on_reset.sql");
const resetApi=file("app/api/admin/platform-control/reset/route.ts");
const controlApi=file("app/api/admin/platform-control/route.ts");
const parentApi=file("app/api/parent/account/route.ts");
const parentSql=file("supabase/migrations/0021_parent_contact_self_service.sql");
const child=file("app/parent/children/[id]/page.tsx");
const family=file("lib/parent/family.ts");

test("0020 migration preserves all ADMIN tiers in user profiles and Auth queues",()=>{
  assert.match(reset,/u\.role<>'ADMIN'::public\.user_role/);
  assert.match(reset,/x\.role<>'ADMIN'::public\.user_role/);
  assert.match(reset,/v_admin_ids_after IS DISTINCT FROM v_admin_ids/);
  assert.match(reset,/CO_ADMIN/);
  assert.match(reset,/hh_platform_reset_policy_version/);
  assert.match(reset,/SELECT 2::integer/);
  assert.match(reset,/status='AUTH_CLEANUP_PENDING'/);
  assert.doesNotMatch(reset,/DELETE FROM public\.users x WHERE x\.school_id=p_school AND x\.id<>p_actor/);
});
test("API refuses unpatched 0019, including when someone bypasses UI",()=>{
  assert.match(controlApi,/hh_platform_reset_policy_version/);
  assert.match(controlApi,/version\.data===2/);
  assert.match(resetApi,/hh_platform_reset_policy_version/);
  assert.match(resetApi,/policy\.data!==2/);
  assert.match(resetApi,/getUserById\(userId\)/);
  assert.match(resetApi,/profile\?\.role==="ADMIN"/);
  assert.match(resetApi,/app_metadata\?\.role==="ADMIN"/);
  assert.match(resetApi,/userId===session\.authUserId/);
});
test("Parent account contacts validated and linked children cannot be edited by a guardian",()=>{
  assert.equal(parentContactSchema.safeParse({phone:"+234 803 555 0123",whatsappNumber:""}).success,true);
  assert.equal(parentContactSchema.safeParse({phone:"",whatsappNumber:""}).success,true);
  assert.equal(parentContactSchema.safeParse({phone:"<script>",whatsappNumber:""}).success,false);
  assert.equal(parentContactSchema.safeParse({phone:"080",whatsappNumber:""}).success,false);
  assert.equal(parentContactSchema.safeParse({phone:"08012345678",whatsappNumber:"",studentIds:["fake"]}).success,false);
  assert.match(parentApi,/requireRole\(\["PARENT"\]\)/);
  assert.match(parentApi,/hh_parent_update_contact/);
  assert.match(parentSql,/u\.role='PARENT'/);
  assert.match(parentSql,/UPDATE public\.parents/);
  assert.match(parentSql,/UPDATE public\.users/);
  assert.doesNotMatch(parentSql,/(UPDATE|INSERT INTO|DELETE FROM) public\.parent_students/);
  assert.doesNotMatch(parentSql,/(UPDATE|INSERT INTO|DELETE FROM) public\.students/);
  assert.match(parentSql,/auth\.uid\(\)/);
});
test("Parent sees multiple linked children, selected child must belong to family",()=>{
  assert.match(family,/\.eq\("parent_id",parent\.id\)/);
  assert.match(family,/\.eq\("school_id",session\.profile\.school_id\)/);
  assert.match(child,/family\.children\.find\(s=>s\.id===id\.data\)/);
  assert.match(child,/if\(!child\)notFound\(\)/);
  assert.match(child,/\.eq\("school_id",family\.schoolId\)/);
  assert.match(child,/\.eq\("student_id",child\.id\)/);
  assert.match(child,/\.eq\("status","PUBLISHED"\)/);
  assert.ok(existsSync("app/parent/account/page.tsx"));
  assert.ok(existsSync("app/parent/children/page.tsx"));
  assert.ok(existsSync("app/parent/notifications/page.tsx"));
  assert.ok(existsSync("app/parent/results/page.tsx"));
  assert.ok(existsSync("app/admin/parents/page.tsx"));
  const sidebar=file("components/layout/Sidebar.tsx");
  assert.match(sidebar,/href: "\/admin\/parents"/);
  assert.match(sidebar,/href: "\/parent\/account"/);
});

test("Guardian notifications can be filtered and marked read only for own school/account",()=>{
  const page=file("app/parent/notifications/page.tsx");
  assert.match(page,/filter==="unread"/);
  assert.match(page,/markAllRead/);
  assert.match(page,/\.eq\("recipient_id",session\.authUserId\)/);
  assert.match(page,/\.eq\("school_id",session\.profile\.school_id\)/);
  assert.match(page,/\.eq\("channel","IN_APP"\)/);
  assert.match(page,/\.is\("read_at",null\)/);
  assert.match(page,/session\.profile\.role!=="PARENT"/);
});
