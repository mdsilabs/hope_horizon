import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const sidebar = readFileSync("components/layout/Sidebar.tsx", "utf8");
const adminLinks = sidebar.match(/ADMIN:\s*\[([\s\S]*?)\],\s*PRINCIPAL:/)?.[1] ?? "";
const page = readFileSync("app/admin/notifications/page.tsx", "utf8");

test("All admin sidebar links point to real App Router pages", () => {
  assert.ok(adminLinks.length > 0);
  const routes = Array.from(adminLinks.matchAll(/href:\s*"([^"]+)"/g), m => m[1]);
  assert.ok(routes.includes("/admin/notifications"));
  for (const route of routes) {
    assert.ok(existsSync(join(process.cwd(), "app", route, "page.tsx")),
      `Missing Admin sidebar page: ${route}`);
  }
});

test("Admin notifications require a valid active ADMIN session", () => {
  assert.match(page, /getCurrentSession/);
  assert.match(page, /session\.profile\.role !== "ADMIN"/);
  assert.match(page, /redirect\("\/login"\)/);
  assert.match(page, /"use server"/);
});

test("Inbox and read updates are confined to the authenticated administrator", () => {
  assert.match(page, /\.eq\("school_id", session\.profile\.school_id\)/);
  assert.match(page, /\.eq\("recipient_id", session\.authUserId\)/);
  assert.match(page, /\.eq\("channel", "IN_APP"\)/);
  assert.match(page, /\.is\("read_at", null\)/);
  assert.match(page, /uuidString\.safeParse\(formData\.get\("notificationId"\)\)/);
  assert.match(page, /revalidatePath\("\/admin\/notifications"\)/);
  assert.doesNotMatch(page, /createAdminClient|service_role|supabase_secret/i);
});

test("Inbox supports all/unread views, individual and bulk mark-read", () => {
  assert.match(page, /filter === "unread"/);
  assert.match(page, /\/admin\/notifications\?filter=unread/);
  assert.match(page, /async function markRead/);
  assert.match(page, /async function markAllRead/);
  assert.match(page, /\.limit\(50\)/);
});
