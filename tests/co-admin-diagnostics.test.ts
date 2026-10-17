import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql=readFileSync("supabase/diagnostics/co_admin_auth_readonly.sql","utf8");
test("Co-Admin diagnostic is read-only and checks Auth trigger installation",()=>{
  assert.match(sql,/on_auth_user_created/);
  assert.match(sql,/co_admin_aware_auth_function/);
  assert.match(sql,/raw_app_meta_data/);
  assert.match(sql,/active_primary_admin/);
  assert.match(sql,/hh_admin_identity_guard/);
  assert.match(sql,/hh_protect_password_setup_flag/);
  const statements=sql.replace(/--[^\n]*/g,"");
  assert.doesNotMatch(statements,/\b(?:INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE)\s+(?:TABLE|FUNCTION|TRIGGER|INTO|FROM|public\.|auth\.)/i);
});
test("Co-Admin Auth failures have an incident reference in server logs",()=>{
  const route=readFileSync("app/api/admin/co-admins/route.ts","utf8");
  assert.match(route,/randomUUID\(\)\.slice\(0,8\)/);
  assert.match(route,/Incident reference: /);
  assert.match(route,/databaseTriggerIndicated/);
});
