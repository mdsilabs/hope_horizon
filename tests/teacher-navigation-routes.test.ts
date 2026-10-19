import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const sidebar=readFileSync("components/layout/Sidebar.tsx","utf8");
const part=sidebar.match(/TEACHER:\s*\[([\s\S]*?)\],\s*STUDENT:/)?.[1]??"";

test("Every teacher sidebar link resolves to an actual Next.js page",()=>{
  assert.ok(part.length>0,"TEACHER links are missing");
  const routes=Array.from(part.matchAll(/href:\s*"([^"]+)"/g),m=>m[1]);
  assert.ok(routes.includes("/teacher/classes"));
  assert.ok(routes.includes("/teacher/notifications"));
  for(const route of routes){
    assert.ok(existsSync(join(process.cwd(),"app",route,"page.tsx")),
      `Missing teacher navigation route: ${route}`);
  }
});

test("My Classes combines class teacher and subject teacher assignments with school scoping",()=>{
  const page=readFileSync("app/teacher/classes/page.tsx","utf8");
  for(const required of [
    '"teacher_classes"','"teacher_subject_assignments"',
    '"students"','"is_active"','"school_id"','session.profile.school_id',
    'getCurrentSession','classTeacher','subjects','/teacher/markbook?',
    '/teacher/compilation/'
  ]) assert.ok(page.includes(required),`Missing ${required}`);
  assert.match(page,/\.eq\("user_id", session\.authUserId\)/);
});

test("Markbook deep link is still checked by the server assignment guard",()=>{
  const page=readFileSync("app/teacher/markbook/page.tsx","utf8");
  const api=readFileSync("app/api/teacher/markbook/route.ts","utf8");
  assert.match(page,/new URLSearchParams\(window\.location\.search\)/);
  assert.match(page,/setSelection\(classId\+":"\+subjectId\)/);
  assert.match(api,/!assignments\.some\(a=>a\.classId===classId&&a\.subjectId===subjectId\)/);
});

test("Teacher notifications can only mark the active user and school's inbox",()=>{
  const page=readFileSync("app/teacher/notifications/page.tsx","utf8");
  assert.match(page,/"use server"/);
  assert.match(page,/\.eq\("recipient_id",session\.authUserId\)/);
  assert.match(page,/\.eq\("school_id",session\.profile\.school_id\)/);
  assert.match(page,/\.eq\("channel","IN_APP"\)/);
  assert.match(page,/\.is\("read_at",null\)/);
});
