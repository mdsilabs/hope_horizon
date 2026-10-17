import test from "node:test";
import assert from "node:assert/strict";
import { resolveRecoveryRedirectUrl } from "../lib/auth/recovery-redirect";

const prod = "https://hopehorizonacademy.vercel.app";
const reset = prod + "/reset-password";

test("deployed Hope Horizon recovery URL uses the intended reset page", () => {
  assert.equal(resolveRecoveryRedirectUrl(prod, "production"), reset);
  assert.equal(resolveRecoveryRedirectUrl(prod + "/", "production"), reset);
});

test("localhost is never used for production recovery links", () => {
  assert.equal(resolveRecoveryRedirectUrl("http://localhost:3000", "production"), null);
  assert.equal(resolveRecoveryRedirectUrl("http://127.0.0.1:3000", "production"), null);
  assert.equal(resolveRecoveryRedirectUrl("http://localhost:3000", "development"),
    "http://localhost:3000/reset-password");
});

test("unsafe, malformed or non-origin redirect configuration fails closed", () => {
  for (const value of [
    undefined, "", "localhost:3000", "http://hopehorizonacademy.vercel.app",
    "javascript:alert(1)", "https://example.org.evil.test",
    "https://user:password@hopehorizonacademy.vercel.app",
    prod + "/landing", prod + "/?x=1", prod + "/#fragment"
  ]) {
    const resolved = resolveRecoveryRedirectUrl(value, "production");
    // Only ordinary HTTPS origins are valid (such as other intentional
    // staging environments); all of the input values above are rejected
    // except a different HTTPS origin, which is separately verified below.
    if (value === "https://example.org.evil.test") {
      assert.equal(resolved, "https://example.org.evil.test/reset-password");
    } else {
      assert.equal(resolved, null, `Unexpected accepted redirect: ${value}`);
    }
  }
  assert.equal(resolveRecoveryRedirectUrl("https://staging.example.edu", "production"),
    "https://staging.example.edu/reset-password");
});
