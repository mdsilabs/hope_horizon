import "server-only";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {createHash} from "node:crypto";
import {Client} from "pg";
import {AppError} from "@/lib/utils/errors";
import {getPublicSupabaseConfig} from "@/lib/supabase/config";
import {approvedMigrations,getApprovedMigration,
  type ApprovedMigration,type MigrationStatus} from "@/lib/platform/migration-catalog";

type HistoryRow={id:string;git_sha:string;applied_at:string};
type RowFlag={installed:boolean|null};

export function migrationRunnerConfigured(){
  return process.env.MIGRATION_RUNNER_ENABLED==="true" &&
    !!process.env.MIGRATION_DATABASE_URL?.trim();
}

export function migrationProjectMatches(connectionString:string,publicUrl:string){
  try{
    const connection=new URL(connectionString);
    const host=new URL(publicUrl).hostname;
    const match=/^([a-z0-9]+)\.supabase\.co$/.exec(host);
    if(!match||!["postgres:","postgresql:"].includes(connection.protocol))return false;
    const ref=match[1];
    // Supabase's direct Postgres endpoint or session pooler, never another
    // instance. Refuse a mismatched database before executing any DDL.
    return connection.hostname===`db.${ref}.supabase.co` ||
      (connection.hostname.endsWith(".pooler.supabase.com") &&
        decodeURIComponent(connection.username)===`postgres.${ref}`);
  }catch{return false;}
}

export function verifyPinnedMigrationSql(item:ApprovedMigration,content:string){
  const bytes=Buffer.from(content,"utf8");
  const gitBlob=createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
  if(gitBlob!==item.gitBlobSha)
    throw new AppError("Migration bundle checksum is inconsistent with the approved release.",503,"MIGRATION_INTEGRITY_FAILURE");
  return content;
}

/** Strip ONLY the top-level wrapper; functions and DO blocks retain their own BEGIN/END. */
export function stripOuterTransaction(sql:string){
  const first=/^(?:\uFEFF)?(?:\s*--[^\r\n]*(?:\r?\n|$))*\s*BEGIN\s*;\s*/i;
  const last=/\s*COMMIT\s*;\s*$/i;
  if(!first.test(sql)||!last.test(sql))
    throw new AppError("Approved migration must have a single explicit outer BEGIN/COMMIT pair.",503);
  return sql.replace(first,"").replace(last,"");
}

function getConnectionString(){
  if(!migrationRunnerConfigured())
    throw new AppError("Super Admin migration runner is not configured by the developer.",503,"MIGRATION_RUNNER_DISABLED");
  const value=process.env.MIGRATION_DATABASE_URL!.trim();
  if(!migrationProjectMatches(value,getPublicSupabaseConfig().url))
    throw new AppError("Migration database is not the configured school Supabase project.",503,"MIGRATION_PROJECT_MISMATCH");
  return value;
}
async function connect(){
  const client=new Client({
    connectionString:getConnectionString(),
    ssl:{rejectUnauthorized:true},
    connectionTimeoutMillis:8000,
    query_timeout:55000,
    statement_timeout:50000,
    application_name:"hope-horizon-superadmin-migrations",
  });
  await client.connect();
  return client;
}
async function hasHistory(client:Client){
  const result=await client.query<{available:boolean}>(
    "SELECT to_regclass('hh_migration.applied_migrations') IS NOT NULL AS available");
  return result.rows[0]?.available===true;
}
async function getHistory(client:Client){
  if(!await hasHistory(client))return [] as HistoryRow[];
  const result=await client.query<HistoryRow>(
    "SELECT id,git_sha,applied_at FROM hh_migration.applied_migrations ORDER BY id");
  return result.rows;
}
async function detect(client:Client,item:ApprovedMigration){
  const r=await client.query<RowFlag>(item.detectorSql);
  return r.rows[0]?.installed===true;
}
async function states(client:Client):Promise<MigrationStatus[]>{
  const history=await getHistory(client);
  const known=new Map(history.map(row=>[row.id,row]));
  // Unknown recorded migrations indicate a code rollback or incompatible
  // release. Do not continue with a potentially divergent schema.
  for(const row of history){
    if(!getApprovedMigration(row.id))
      throw new AppError("Database migration history contains an unrecognized version. Review the deployment.",409,"MIGRATION_HISTORY_DRIFT");
  }
  const result:MigrationStatus[]=[];
  let canProceed=true;
  for(const item of approvedMigrations){
    const ledger=known.get(item.id);
    const exists=await detect(client,item);
    let state:MigrationStatus["state"];
    if(ledger){
      state=ledger.git_sha!==item.gitBlobSha||!exists?"drift":"applied";
    }else{
      state=exists?"already_present":canProceed?"pending":"blocked";
    }
    if(state==="pending"||state==="blocked"||state==="drift")canProceed=false;
    result.push({id:item.id,title:item.title,state,
      source:ledger?"console":exists?"external":null,
      appliedAt:ledger?.applied_at??null});
  }
  return result;
}
async function schoolPaused(client:Client){
  const t=await client.query<{installed:boolean}>(
    "SELECT to_regclass('public.platform_installation_controls') IS NOT NULL AS installed");
  if(!t.rows[0]?.installed)return false;
  const r=await client.query<{paused:boolean}>(
    "SELECT paused FROM public.platform_installation_controls WHERE id=1");
  return r.rows[0]?.paused===true;
}
export async function getMigrationOverview(){
  if(!migrationRunnerConfigured()){
    return {configured:false,paused:false,
      note:"Configure MIGRATION_DATABASE_URL and MIGRATION_RUNNER_ENABLED on the server.",
      migrations:[] as MigrationStatus[]};
  }
  const client=await connect();
  try{
    return {configured:true,paused:await schoolPaused(client),
      note:"Migrations 0001–0014 belong to one-time initial bootstrap; the Super Admin can apply approved upgrades from 0015 onward.",
      migrations:await states(client)};
  }finally{await client.end();}
}

export async function applyApprovedMigration(id:string,actorId:string,schoolId:string){
  const item=getApprovedMigration(id);
  if(!item)throw new AppError("Migration ID is not in the approved release.",422,"UNKNOWN_MIGRATION");
  const content=verifyPinnedMigrationSql(item,
    readFileSync(resolve(process.cwd(),"supabase","migrations",item.file),"utf8"));
  const statements=stripOuterTransaction(content);

  const client=await connect();
  let started=false;
  try{
    await client.query("BEGIN");started=true;
    await client.query("SET LOCAL lock_timeout = '8s'");
    await client.query("SET LOCAL statement_timeout = '50s'");
    const l=await client.query<{locked:boolean}>(
      "SELECT pg_try_advisory_xact_lock(16328602,21021) AS locked");
    if(!l.rows[0]?.locked)
      throw new AppError("Another migration is running. Refresh the page when it finishes.",409,"MIGRATION_BUSY");

    // Compare the account's current role in the target database too,
    // not just the Supabase HTTP login. No Co-Admin may trigger DDL.
    const actor=await client.query<{valid:boolean}>(
      `SELECT count(*)=1 AS valid FROM public.users u WHERE
       u.id=$1 AND u.school_id=$2 AND u.role='ADMIN' AND
       u.admin_tier='PRIMARY' AND u.is_active AND NOT u.must_change_password`,[actorId,schoolId]);
    if(!actor.rows[0]?.valid)
      throw new AppError("The original Primary Administrator is not active in this database.",403);

    const current=await states(client);
    if(current.some(m=>m.state==="drift"))
      throw new AppError("Detected database migration drift. Stop and review before applying changes.",409);
    const target=current.find(m=>m.id===id);
    if(!target||target.state!=="pending")
      throw new AppError("Migration is not the next pending approved version.",409,"MIGRATION_ORDER");

    // A deployed maintenance pause is required for any subsequent schema
    // change. 0018 itself installs the pause feature and is exempt.
    const maintenanceAvailable=await client.query<{installed:boolean}>(
      "SELECT to_regclass('public.platform_installation_controls') IS NOT NULL AS installed");
    if(maintenanceAvailable.rows[0]?.installed&&!await schoolPaused(client))
      throw new AppError("Pause the school portal from Super Admin controls before applying this migration.",409,"PAUSE_REQUIRED");

    // This history ledger is kept in a separate PostgreSQL schema so the
    // operational school-reset schema guard cannot mistake it for school data.
    await client.query("CREATE SCHEMA IF NOT EXISTS hh_migration");
    await client.query("REVOKE ALL ON SCHEMA hh_migration FROM PUBLIC");
    await client.query(`CREATE TABLE IF NOT EXISTS hh_migration.applied_migrations(
      id text PRIMARY KEY,
      git_sha char(40) NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now(),
      applied_by uuid NOT NULL,
      school_id uuid NOT NULL
    )`);
    await client.query("REVOKE ALL ON hh_migration.applied_migrations FROM PUBLIC");

    // No browser-supplied SQL, filenames, paths or connection strings.
    // The actual SQL is read from an exact source-reviewed file.
    await client.query(statements);
    if(!await detect(client,item))
      throw new AppError("Migration postcondition did not pass; changes were rolled back.",409);

    await client.query(
      `INSERT INTO hh_migration.applied_migrations(id,git_sha,applied_by,school_id)
       VALUES($1,$2,$3,$4)`,[item.id,item.gitBlobSha,actorId,schoolId]);
    await client.query(
      `INSERT INTO public.audit_logs(school_id,user_id,action,entity_type,metadata)
       VALUES($1,$2,'SYSTEM_SETTING_CHANGED','schema_migration',
         jsonb_build_object('operation','migration_applied','migration_id',$3,'approved_blob',$4))`,
      [schoolId,actorId,item.id,item.gitBlobSha]);

    await client.query("COMMIT");started=false;
    return {id:item.id,title:item.title};
  }catch(error){
    if(started){
      try{await client.query("ROLLBACK");}
      catch(rollbackError){console.error("Migration rollback failed",rollbackError);}
    }
    if(error instanceof AppError)throw error;
    console.error("Super Admin migration failed",{
      migration:id,code:(error as {code?:string})?.code,
      message:error instanceof Error?error.message:"unknown database failure",
    });
    throw new AppError("Migration failed and was rolled back. Review the server logs and database state.",409,"MIGRATION_FAILED");
  }finally{await client.end();}
}
