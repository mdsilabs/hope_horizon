import test from "node:test";
import assert from "node:assert/strict";
import { firstAdminSetupSchema } from "../lib/validations/first-admin";

const valid = {
  adminName: "Hope Horizon Administrator",
  adminEmail: "admin@example.edu.ng",
  adminPassword: "A-Never-Shared-Password-123!",
  schoolName: "Hope Horizon Academy",
  confirmation: "CREATE_FIRST_ADMIN",
};
test("first administrator setup accepts a strong locally entered password", () => {
  const result = firstAdminSetupSchema.safeParse(valid);
  assert.equal(result.success, true);
});
test("first administrator setup does not accept role, JWT or arbitrary project settings", () => {
  assert.equal(firstAdminSetupSchema.safeParse({ ...valid, role: "SUPER_ADMIN" }).success, false);
  assert.equal(firstAdminSetupSchema.safeParse({ ...valid, supabaseUrl: "https://another-project.supabase.co" }).success, false);
});
test("first administrator setup requires explicit confirmation and strong passwords", () => {
  assert.equal(firstAdminSetupSchema.safeParse({ ...valid, confirmation: "yes" }).success, false);
  assert.equal(firstAdminSetupSchema.safeParse({ ...valid, adminPassword: "12345678" }).success, false);
});
test("first administrator setup validates optional existing-school identifier", () => {
  assert.equal(firstAdminSetupSchema.safeParse({ ...valid, schoolId: "not-a-uuid" }).success, false);
  assert.equal(firstAdminSetupSchema.safeParse({ ...valid, schoolId: "550e8400-e29b-41d4-a716-446655440000" }).success, true);
});
