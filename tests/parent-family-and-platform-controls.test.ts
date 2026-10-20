import test from "node:test";
import assert from "node:assert/strict";
import {existsSync,readFileSync} from "node:fs";
const file=(p:string)=>readFileSync(p,"utf8");

test("All parent sidebar navigation links resolve to pages",()=>{
  const sidebar=file("components/layout/Sidebar.tsx");
  const parent=sidebar.match(/PARENT:\s*\[([\s\S]*?)\],\s*ACCOUNTANT:/)?.[1]??"";
  assert.ok(parent.includes("/parent/children"));
  assert.ok(parent.includes("/parent/notifications"));
  const routes=Array.from(parent.matchAll(/href:\s*"([^"]+)"/g),match=>match[1]);
  for(const route of routes)assert.ok(existsSync("app"+route+"/page.tsx"),route);
});

test("Parent directory supports multiple linked children without cross-school data",()=>{
  const family=file("lib/parent/family.ts");
  assert.match(family,/session\.profile\.role!=="PARENT"/);
  assert.match(family,/\.eq\("user_id",session\.authUserId\)/);
  assert.match(family,/\.eq\("parent_id",parent\.id\)/);
  assert.match(family,/\.eq\("school_id",session\.profile\.school_id\)/);
  const children=file("app/parent/children/page.tsx");
  assert.match(children,/family\.children\.map\(/);
  assert.match(children,/\.eq\("status","PUBLISHED"\)/);
  assert.match(children,/\.in\("student_id",ids\)/);
});

test("Parent published results explicitly scope the selected student and require linked child",()=>{
  const results=file("app/parent/results/page.tsx");
  const detail=file("app/parent/results/[id]/page.tsx");
  assert.match(results,/authorizedChildren\.find\(c=>c\.id===childId\)/);
  assert.match(results,/\.eq\("status","PUBLISHED"\)/);
  assert.match(results,/\.in\("student_id",allowedIds\)/);
  assert.match(results,/\.eq\("school_id",family\.schoolId\)/);
  assert.match(detail,/family\.children\.map\(c=>c\.id\)/);
  assert.match(detail,/\.eq\("status","PUBLISHED"\)/);
  assert.match(detail,/\.in\("student_id",ids\)/);
});
test("Parent notification mutation is own-recipient and tenant limited",()=>{
  const n=file("app/parent/notifications/page.tsx");
  assert.match(n,/session\.profile\.role!=="PARENT"/);
  assert.match(n,/\.eq\("recipient_id",session\.authUserId\)/);
  assert.match(n,/\.eq\("school_id",session\.profile\.school_id\)/);
  assert.match(n,/\.eq\("channel","IN_APP"\)/);
  assert.match(n,/\.is\("read_at",null\)/);
});
test("Only independently configured vendor owner has maintenance authority",()=>{
  const owner=file("lib/platform/owner.ts");
  const api=file("app/api/admin/platform-control/route.ts");
  const layout=file("app/admin/platform-control/layout.tsx");
  assert.match(owner,/PLATFORM_SUPERADMIN_AUTH_USER_ID/);
  assert.match(owner,/PLATFORM_INSTALLATION_SCHOOL_ID/);
  assert.match(owner,/session\.authUserId===id/);
  assert.match(api,/await requirePlatformOwner\(\)/);
  assert.match(api,/origin!==new URL\(request\.url\)\.origin/);
  assert.match(api,/PAUSE|RESUME/);
  assert.match(layout,/configuredPlatformOwner/);
  assert.doesNotMatch(api,/delete\(|truncate|\.rpc\(".*reset/i);
  assert.match(api,/destructiveResetAvailable:false/);
});
test("Pause protects every user-facing page and API and all existing authenticated writes",()=>{
  const migration=file("supabase/migrations/0018_installation_pause_controls.sql");
  const mw=file("middleware.ts");
  assert.match(migration,/paused boolean NOT NULL DEFAULT false/);
  assert.match(migration,/REVOKE ALL ON public\.platform_installation_controls FROM anon,authenticated/);
  assert.match(migration,/public\.hh_installation_pause_write_guard/);
  assert.match(migration,/BEFORE INSERT OR UPDATE OR DELETE/);
  assert.match(migration,/auth\.role\(\)\)='authenticated'/);
  assert.match(mw,/maintenance\?\.paused/);
  assert.match(mw,/pathname\.startsWith\("\/api\/"\)/);
  assert.match(mw,/NextResponse\.redirect\(new URL\("\/system-paused"/);
  assert.match(mw,/pathname==="\/admin\/platform-control"/);
});
