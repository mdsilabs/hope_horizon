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
test("inactive Co-Admin loses all school-scoped RLS privileges",()=>{
  assert.match(sql,/create or replace function public\.current_user_school_id\(\)/i);
  assert.match(sql,/create or replace function public\.current_user_role\(\)/i);
  assert.match(sql,/where u\.id = \(select auth\.uid\(\)\) and u\.is_active/i);
});

test("SQL helper function bodies use matched PostgreSQL dollar quotes",()=>{
  assert.match(sql,/as \$hh_school_id\$[\s\S]+?\$hh_school_id\$;/);
  assert.match(sql,/as \$hh_user_role\$[\s\S]+?\$hh_user_role\$;/);
  assert.doesNotMatch(sql,/\bas \$(?!\$|[a-zA-Z_])/i);
  assert.match(sql,/admin_tier is not null and admin_tier in/);
});
