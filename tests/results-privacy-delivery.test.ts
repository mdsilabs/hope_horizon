import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const verificationApi = readFileSync("app/api/results/verify/route.ts", "utf8");
const verificationPage = readFileSync("app/(public)/result-verification/page.tsx", "utf8");
const notifications = readFileSync("services/notificationService.ts", "utf8");

test("public result verification does not expose grades or averages", () => {
  assert.doesNotMatch(verificationApi, /overall_average|overallAverage|subject_scores|ca_score|exam_score/);
  assert.doesNotMatch(verificationPage, /overallAverage/);
  assert.match(verificationApi, /\.eq\("status", "PUBLISHED"\)/);
});

test("unsupported WhatsApp transport fails instead of reporting SENT", () => {
  assert.match(notifications, /case "WHATSAPP":\s*await dispatchWhatsapp\(input\)/);
  assert.match(notifications, /async function dispatchWhatsapp[\s\S]*?throw new Error\("WhatsApp notification provider is not configured\."\)/);
  assert.match(notifications, /catch \(err\) \{\s*status = "FAILED"/);
});

test("legacy result submission requires leadership and cannot bypass class workflow", () => {
  const source = readFileSync("services/resultService.ts", "utf8");
  const start = source.indexOf("export async function submitResult(");
  const end = source.indexOf("export async function decideResultApproval(", start);
  assert.ok(start >= 0 && end > start);
  const submit = source.slice(start, end);
  assert.match(submit, /\["ADMIN", "PRINCIPAL", "VICE_PRINCIPAL"\]\.includes\(session\.profile\.role\)/);
  assert.match(submit, /\.from\("class_result_batches"\)/);
  assert.match(submit, /\.eq\("school_id", session\.profile\.school_id\)/);
  assert.match(submit, /\.eq\("status", "DRAFT"\)/);
  assert.match(submit, /Result was already submitted or changed/);
});
