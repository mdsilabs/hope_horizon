import test from "node:test";
import assert from "node:assert/strict";
import {
  SUPABASE_PROJECT_REF, SUPABASE_PROJECT_NAME, SUPABASE_PROJECT_URL,
  SUPABASE_PUBLISHABLE_KEY, getPublicSupabaseConfig,
} from "../lib/supabase/config";

test("Hope Horizon resolves exactly to its selected Supabase project", () => {
  assert.equal(SUPABASE_PROJECT_NAME, "supabase-cyclamen-park");
  assert.equal(new URL(SUPABASE_PROJECT_URL).hostname, SUPABASE_PROJECT_REF + ".supabase.co");
  assert.match(SUPABASE_PUBLISHABLE_KEY, /^sb_publishable_/);
  assert.equal(getPublicSupabaseConfig().url, SUPABASE_PROJECT_URL);
});
test("a different Supabase project URL is rejected, not silently used", () => {
  const original = process.env.NEXT_PUBLIC_SUPABASE_URL;
  try {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://not-hope-horizon.supabase.co";
    assert.throws(() => getPublicSupabaseConfig(), /project mismatch/);
  } finally {
    if (original === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = original;
  }
});
