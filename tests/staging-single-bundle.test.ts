import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync("supabase/staging/hope_horizon_all_migrations_and_staging.sql","utf8");
const names = [
  "0001_init", "0002_rls_policies", "0003_auth_sync_trigger",
  "0004_harden_account_provisioning", "0005_teacher_academic_workflows",
  "0006_family_account_integrity", "0007_profile_cloudinary",
  "0008_co_admin_roles", "0009_subject_class_compilation",
  "0010_class_review_signoff", "0011_class_release_report_cards",
  "0012_onboarding_password_guard", "0013_privileged_rpc_auth_guard",
];

test("single staging SQL includes all thirteen migrations in their original order", () => {
  let last = -1;
  for (const name of names) {
    const header = `SOURCE MIGRATION ${name}.sql`;
    const pos = sql.indexOf(header);
    assert.ok(pos > last, `Missing or reordered migration: ${name}`);
    last = pos;
    const source = readFileSync(`supabase/migrations/${name}.sql`,"utf8")
      .replace(/^(?:begin|commit);\s*$/gmi,
        "-- Transaction boundary handled by outer staging bundle.").trim();
    assert.ok(sql.includes(source), `Migration ${name} changed while combining`);
  }
});
test("single staging SQL requires deliberate confirmation and empty project", () => {
  assert.match(sql, /-- SET LOCAL hh\.qa_staging_confirm =/);
  assert.match(sql, /current_setting\('hh\.qa_staging_confirm', true\)/);
  assert.match(sql, /to_regclass\('public\.schools'\) IS NOT NULL/);
  assert.match(sql, /FROM auth\.users LIMIT 1/);
  assert.equal((sql.match(/^BEGIN;$/gm)||[]).length,1);
  assert.equal((sql.match(/^COMMIT;$/gm)||[]).length,1);
});
test("fixture populates five subjects and ten unlinked student academic records", () => {
  assert.match(sql,/generate_series\(1,10\)/);
  assert.match(sql,/QA Student /);
  assert.match(sql,/QA\/2026\//);
  assert.match(sql,/five subjects and ten students/);
  assert.doesNotMatch(sql,/INSERT INTO auth\.users/i);
});
