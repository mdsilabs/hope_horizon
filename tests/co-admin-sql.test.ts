import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {join} from "node:path";

// Static contract check; does NOT substitute for database integration tests.
const sql=readFileSync(join(process.cwd(),"supabase/migrations/0008_co_admin_roles.sql"),"utf8");
test("SQL migration labels existing admins PRIMARY, not CO_ADMIN",()=>{
  assert.match(sql,/update public\.users set admin_tier = 'PRIMARY'/i);
});
test("SQL protects primary admin from deletion, deactivation and tier changes",()=>{
  assert.match(sql,/if tg_op = 'DELETE'/i);
  assert.match(sql,/The primary administrator cannot be deleted/);
  assert.match(sql,/The primary administrator cannot be disabled or reassigned/);
  assert.match(sql,/Identity, school, administrator tier and role are immutable/);
});
test("SQL requires trusted app metadata for newly created CO_ADMIN accounts",()=>{
  assert.match(sql,/raw_app_meta_data ->> 'admin_tier'/);
  assert.match(sql,/elsif v_tier = 'CO_ADMIN'/);
});
