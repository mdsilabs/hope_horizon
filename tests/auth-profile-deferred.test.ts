import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration=readFileSync("supabase/migrations/0014_deferred_auth_profile_provisioning.sql","utf8");
const diagnostics=readFileSync("supabase/diagnostics/co_admin_auth_deep_inspect.sql","utf8");
test("Auth profile sync waits for trusted app_metadata on insert or subsequent update",()=>{
  assert.match(migration,/CREATE OR REPLACE FUNCTION public\.handle_new_auth_user\(\)/i);
  assert.match(migration,/AFTER INSERT OR UPDATE OF raw_app_meta_data ON auth\.users/i);
  assert.match(migration,/NEW\.raw_app_meta_data\s*->>\s*'school_id'/);
  assert.match(migration,/NEW\.raw_app_meta_data\s*->>\s*'role'/);
  assert.match(migration,/IF v_school_text IS NULL OR v_role_text IS NULL THEN\s*RETURN NEW;/i);
  assert.match(migration,/IF EXISTS \(SELECT 1 FROM public\.users u WHERE u\.id = NEW\.id\)/i);
  assert.match(migration,/BEGIN;[\s\S]*COMMIT;/i);
});
test("admin privilege and immutable tier restrictions remain enforced",()=>{
  assert.match(migration,/ELSIF v_tier='CO_ADMIN' THEN/);
  assert.match(migration,/v_tier='PRIMARY'/);
  assert.match(migration,/admin_tier='PRIMARY' AND u\.is_active/);
  assert.match(migration,/ELSE[\s\S]*ADMIN provisioning requires a trusted admin_tier/);
  assert.doesNotMatch(migration,/\(NEW\.raw_user_meta_data->>'(?:school_id|role|admin_tier)'\)/);
  assert.doesNotMatch(migration,/DROP (?:POLICY|TABLE) /i);
});
test("deep inspection orders JSON aggregations within the aggregate",()=>{
  assert.match(diagnostics,/jsonb_agg\(jsonb_build_object\(\s*'column',[\s\S]*?\)\s*ORDER BY c\.column_name\s*\)/);
  assert.match(diagnostics,/jsonb_agg\(jsonb_build_object\(\s*'name',c\.conname,[\s\S]*?\)\s*ORDER BY c\.conname\s*\)/);
});
