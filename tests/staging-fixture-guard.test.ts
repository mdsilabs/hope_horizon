import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SUPABASE_PROJECT_REF, SUPABASE_PROJECT_URL, getPublicSupabaseConfig } from "../lib/supabase/config";

const sql = readFileSync("supabase/staging/qa_results_fixture.sql", "utf8");
const seed = readFileSync("scripts/seed-results-staging.ts", "utf8");
const verify = readFileSync("scripts/verify-results-staging.ts", "utf8");

test("staging fixture refuses to touch an existing real school", () => {
  assert.match(sql, /name <> 'Hope Horizon QA STAGING'/);
  assert.match(sql, /raise exception 'Refusing to seed/);
  assert.match(sql, /commit;/i);
  assert.match(sql, /for i in 1\.\.5 loop/);
});
test("staging seed requires explicit project identity, refuses production, and reads password privately", () => {
  assert.match(seed, /ALLOW_STAGING_SEED/);
  assert.match(seed, /EXPECTED_STAGING_PROJECT_REF/);
  assert.match(seed, /STAGING_TEST_PASSWORD/);
  assert.match(seed, /ref === "iwfpdwihinhcwjgvmfei"/);
  assert.doesNotMatch(seed, /const DEFAULT_PASSWORD\s*=/);
});
test("workflow QA covers markbooks correction signoff approval publication and withdrawal", () => {
  for (const rpc of ["hh_save_subject_markbook","hh_request_subject_correction",
    "hh_clear_subject_correction","hh_save_class_report_entries","hh_signoff_class_review",
    "hh_compile_class_results","hh_head_decide_class_batch","hh_release_class_batch"]) {
    assert.ok(verify.includes(rpc), `Missing ${rpc}`);
  }
  assert.match(verify, /qa\.student\.01@example\.test/);
  assert.match(verify, /qa\.parent\.01@example\.test/);
});
test("production Supabase remains pinned unless staging is explicitly enabled", () => {
  assert.equal(SUPABASE_PROJECT_REF, "iwfpdwihinhcwjgvmfei");
  const previous=process.env.NEXT_PUBLIC_HOPE_HORIZON_STAGING;
  try {
    delete process.env.NEXT_PUBLIC_HOPE_HORIZON_STAGING;
    assert.equal(getPublicSupabaseConfig().url, SUPABASE_PROJECT_URL);
  } finally {
    if(previous===undefined)delete process.env.NEXT_PUBLIC_HOPE_HORIZON_STAGING;
    else process.env.NEXT_PUBLIC_HOPE_HORIZON_STAGING=previous;
  }
});
