import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {diagnoseCoAdminCreateFailure} from "../lib/admin/co-admin-errors";

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
 assert.equal(brokenTrigger.code,"MIGRATION_REQUIRED");
 assert.match(brokenTrigger.message,/migrations 0008 and 0012/);
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
