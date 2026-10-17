import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const endpoint=readFileSync(
  "app/api/admin/co-admins/[id]/issue-temporary-password/route.ts","utf8"
);
const page=readFileSync("app/admin/co-admins/page.tsx","utf8");
const email=readFileSync("lib/admin/account-onboarding.ts","utf8");
const resend=readFileSync("app/api/admin/co-admins/[id]/send-setup/route.ts","utf8");
const list=readFileSync("app/api/admin/co-admins/route.ts","utf8");

test("Only Primary Admin can issue a pending CO_ADMIN one-time password",()=>{
  assert.match(endpoint,/requireRole\(\["ADMIN"\]\)/);
  assert.match(endpoint,/session\.profile\.admin_tier !== "PRIMARY"/);
  assert.match(endpoint,/id === session\.authUserId/);
  assert.match(endpoint,/profile\.admin_tier !== "CO_ADMIN"/);
  assert.match(endpoint,/!profile\.must_change_password/);
  assert.match(endpoint,/authUser\.app_metadata\?\.admin_tier !== "CO_ADMIN"/);
  assert.match(endpoint,/admin\.auth\.admin\.updateUserById\(id,/);
  assert.match(endpoint,/generateTemporaryPassword\(\)/);
  assert.doesNotMatch(endpoint,/console\.log\(.*password/i);
});

test("Recovery requires same-origin POST confirmation, read-only metadata and log audit",()=>{
  assert.match(endpoint,/origin !== new URL\(request\.url\)\.origin/);
  assert.match(endpoint,/ISSUE_TEMPORARY_PASSWORD/);
  assert.match(endpoint,/audit_logs/);
  assert.match(endpoint,/PASSWORD_RESET_REQUESTED/);
  assert.match(endpoint,/Cache-Control":"no-store, private"/);
  assert.match(endpoint,/120_000/);
  assert.doesNotMatch(endpoint,/app_metadata\s*:/);
  assert.doesNotMatch(endpoint,/\.update\(\{must_change_password:false\}\)/);
});

test("Existing co-admin can receive temp-password recovery in UI and email diagnosis distinguishes failures",()=>{
  assert.match(page,/primarySignedIn&&a\.must_change_password&&a\.is_active/);
  assert.match(page,/Issue temporary password/);
  assert.match(page,/setCredential\(\{email:result\.email,password:result\.temporaryPassword\}\)/);
  assert.match(list,/must_change_password,last_login_at/);
  assert.match(email,/invalid_redirect/);
  assert.match(email,/auth_rejected/);
  assert.match(resend,/EMAIL_REDIRECT_CONFIGURATION/);
  assert.match(resend,/AUTH_EMAIL_DELIVERY/);
});
