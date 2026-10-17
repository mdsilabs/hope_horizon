import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {diagnoseCoAdminCreateFailure,sanitizeAuthErrorForServerLog} from "../lib/admin/co-admin-errors";

test("duplicate email is the only Auth category labeled as an existing account",()=>{
 const duplicate=diagnoseCoAdminCreateFailure({code:"email_exists",status:422});
 assert.equal(duplicate.code,"ACCOUNT_EXISTS");
 assert.equal(duplicate.status,409);
 const unknown=diagnoseCoAdminCreateFailure({code:"unknown_error",status:500});
 assert.notEqual(unknown.code,"ACCOUNT_EXISTS");
 assert.match(unknown.message,/Supabase Auth/);
});
test("Auth trigger and missing key failures are actionable and safe",()=>{
 const brokenTrigger=diagnoseCoAdminCreateFailure({
   code:"unexpected_failure",status:500,message:"Database error saving new user",
 });
 assert.equal(brokenTrigger.code,"AUTH_DATABASE_ERROR");
 assert.match(brokenTrigger.message,/matching Postgres error/);
 const actualLog=diagnoseCoAdminCreateFailure({
   status:500,message:"Database error creating new user",
 });
 assert.equal(actualLog.code,"AUTH_DATABASE_ERROR");
 assert.match(actualLog.message,/Do not rerun migrations/);
 const invalidKey=diagnoseCoAdminCreateFailure({status:401,code:"invalid_credentials"});
 assert.equal(invalidKey.code,"AUTH_CONFIGURATION_ERROR");
 assert.match(invalidKey.message,/SUPABASE_SECRET_KEY/);
 const leak="secret-auth-internal-token";
 const failure=diagnoseCoAdminCreateFailure({code:"other_error",message:leak});
 assert.ok(!JSON.stringify(failure).includes(leak));
});
test("creation checks the password guard, primary admin, and server Auth admin key",()=>{
 const route=readFileSync("app/api/admin/co-admins/route.ts","utf8");
 assert.match(route,/hh_onboarding_guard_ready/);
 assert.match(route,/hh_portal_capabilities/);
 assert.match(route,/admin\.auth\.admin\.listUsers/);
 assert.match(route,/creationReadiness/);
 assert.match(route,/await admin\.from\("users"\)/);
 assert.match(route,/diagnoseCoAdminCreateFailure\(createError\)/);
 assert.match(route,/generateTemporaryPassword\(\)/);
 assert.match(route,/admin_tier:"CO_ADMIN"/);
});

test("Auth log messages redact email, token, URL and UUID before server logging",()=>{
 const message="Error creating admin bob@example.edu at https://app.example.test/secret token sb_secret_longsupersecret1234 for 550e8400-e29b-41d4-a716-446655440000";
 const logged=sanitizeAuthErrorForServerLog(message);
 for(const token of ["bob@example.edu","https://app.example.test/secret","sb_secret_longsupersecret1234","550e8400-e29b-41d4-a716-446655440000"])assert.ok(!logged.includes(token));
 assert.match(logged,/Error creating admin/);
 assert.ok(logged.length<=350);
});
