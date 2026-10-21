import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync,existsSync} from "node:fs";
import {createHash} from "node:crypto";

const file=(path:string)=>readFileSync(path,"utf8");
const manifest=file("lib/platform/migration-catalog.ts");
const runner=file("lib/platform/migration-runner.ts");
const api=file("app/api/admin/platform-control/migrations/route.ts");
const screen=file("app/admin/platform-control/migrations/page.tsx");
const middleware=file("middleware.ts");
const config=file("next.config.mjs");
const env=file(".env.example");

const releases=[
  ["0015_teacher_irregularity_requests.sql","ffac0d36e50ddb832b92e7ced16446035920950d"],
  ["0016_class_teacher_irregularity_requests.sql","861a6c7253dad3fa4acf5b6342e30a0561cd2fdb"],
  ["0017_irregularity_input_validation.sql","53cd004e0c6553010df2067193fdde1e83be7b84"],
  ["0018_installation_pause_controls.sql","922a67e1d8acf8b862dd4d2f5e0f09c052cc5ec1"],
  ["0019_primary_admin_and_guarded_operational_reset.sql","05c360e4d0681f591b0f26169d618a3e90c9f853"],
  ["0020_preserve_all_admins_on_reset.sql","89f78180cb9168dad0b4d372e15cc9fbea18d02a"],
  ["0021_parent_contact_self_service.sql","a0d19c900b24c7bb3896c125f660dcb7029c8090"],
] as const;

test("Every reviewed migration checksum matches the exact tracked SQL Git blob",()=>{
  for(const [filename,sha] of releases){
    const sql=file("supabase/migrations/"+filename);
    const bytes=Buffer.from(sql,"utf8");
    const actual=createHash("sha1").update("blob "+bytes.length+"\0").update(bytes).digest("hex");
    assert.equal(actual,sha,filename);
    assert.ok(manifest.includes(sha),"Checksum pinned for "+filename);
    assert.match(sql,/\bBEGIN\s*;/i);
    assert.match(sql,/\bCOMMIT\s*;\s*$/i);
  }
});

test("Super Admin runner never accepts browser-supplied SQL or arbitrary file paths",()=>{
  assert.match(api,/requirePlatformOwner\(\)/);
  assert.match(api,/getApprovedMigration\(body\.migrationId\)/);
  assert.match(api,/origin!==request\.nextUrl\.origin/);
  assert.match(api,/APPLY \$\{migration\.id\}/);
  assert.doesNotMatch(api,/body\.(?:sql|path|connectionString|script)/);
  assert.match(runner,/resolve\(process\.cwd\(\),"supabase","migrations",item\.file\)/);
  assert.match(runner,/verifyPinnedMigrationSql\(item/);
  assert.match(runner,/gitBlob!==item\.gitBlobSha/);
  assert.match(runner,/MIGRATION_RUNNER_ENABLED/);
  assert.match(runner,/MIGRATION_DATABASE_URL/);
  assert.match(runner,/migrationProjectMatches/);
  assert.doesNotMatch(runner,/eval\(|new Function\(/);
});
test("Apply is transactional, serialized, audited, ordered and verifiable",()=>{
  assert.match(runner,/client\.query\("BEGIN"\)/);
  assert.match(runner,/pg_try_advisory_xact_lock/);
  assert.match(runner,/states\(client\)/);
  assert.match(runner,/target\.state!=="pending"/);
  assert.match(runner,/client\.query\(statements\)/);
  assert.match(runner,/if\(!await detect\(client,item\)\)/);
  assert.match(runner,/INSERT INTO hh_migration\.applied_migrations/);
  assert.match(runner,/INSERT INTO public\.audit_logs/);
  assert.match(runner,/client\.query\("COMMIT"\)/);
  assert.match(runner,/client\.query\("ROLLBACK"\)/);
  assert.match(runner,/REVOKE ALL ON SCHEMA hh_migration FROM PUBLIC/);
  assert.match(runner,/REVOKE ALL ON hh_migration\.applied_migrations FROM PUBLIC/);
  assert.match(runner,/u\.admin_tier='PRIMARY'/);
  assert.match(runner,/u\.school_id=\$2/);
});
test("Migrations shown read-only until apply and pause is required after 0018",()=>{
  assert.match(runner,/if\(maintenanceAvailable\.rows\[0\]\?\.installed&&!await schoolPaused\(client\)\)/);
  assert.match(screen,/next\.state==="pending"/);
  assert.match(screen,/migration-confirmation/);
  assert.match(screen,/schemaDrift/);
  assert.match(screen,/pauseRequired/);
  assert.match(screen,/APPLY /);
  assert.ok(existsSync("app/admin/platform-control/layout.tsx"));
  assert.match(middleware,/pathname\.startsWith\("\/admin\/platform-control\/"\)/);
  assert.match(middleware,/pathname\.startsWith\("\/api\/admin\/platform-control"\)/);
});
test("Server bundling and developer-only credentials are documented",()=>{
  assert.match(config,/outputFileTracingIncludes/);
  assert.match(config,/supabase\/migrations\/\*\.sql/);
  assert.match(env,/MIGRATION_RUNNER_ENABLED=false/);
  assert.match(env,/MIGRATION_DATABASE_URL=/);
  assert.doesNotMatch(env,/NEXT_PUBLIC_MIGRATION_DATABASE_URL/);
  assert.ok(existsSync("app/admin/platform-control/migrations/page.tsx"));
});
