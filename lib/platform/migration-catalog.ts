import "server-only";

/**
 * Reviewed, pinned migration catalogue. This is NOT a SQL editor.
 * A new migration must be committed, reviewed, sha-pinned and added here
 * during a normal code release before any Super Admin may apply it.
 *
 * Versions 0001..0014 bootstrap the app/first-admin and are intentionally
 * excluded: they cannot be run by an account that does not yet exist.
 */
export type ApprovedMigration={
  id:string;file:string;title:string;gitBlobSha:string;detectorSql:string;
};
const requestSignature="public.hh_submit_irregularity(text,uuid,uuid,uuid,uuid,jsonb,text)";

export const approvedMigrations:readonly ApprovedMigration[]=Object.freeze([
  {id:"0015",file:"0015_teacher_irregularity_requests.sql",
   title:"Teacher irregularity request workflow",
   gitBlobSha:"ffac0d36e50ddb832b92e7ced16446035920950d",
   detectorSql:"SELECT to_regclass('public.hh_irregularity_requests') IS NOT NULL AND to_regprocedure('"+requestSignature+"') IS NOT NULL AS installed"},
  {id:"0016",file:"0016_class_teacher_irregularity_requests.sql",
   title:"Class-teacher request permissions",
   gitBlobSha:"861a6c7253dad3fa4acf5b6342e30a0561cd2fdb",
   detectorSql:"SELECT COALESCE(position('NOT v_own_class AND NOT EXISTS' in pg_get_functiondef(to_regprocedure('"+requestSignature+"')))>0,false) AS installed"},
  {id:"0017",file:"0017_irregularity_input_validation.sql",
   title:"Irregularity form database validation",
   gitBlobSha:"53cd004e0c6553010df2067193fdde1e83be7b84",
   detectorSql:"SELECT COALESCE(position('v_score_ca*100<>trunc(v_score_ca*100)' in pg_get_functiondef(to_regprocedure('"+requestSignature+"')))>0,false) AS installed"},
  {id:"0018",file:"0018_installation_pause_controls.sql",
   title:"Installation maintenance pause controls",
   gitBlobSha:"922a67e1d8acf8b862dd4d2f5e0f09c052cc5ec1",
   detectorSql:"SELECT to_regclass('public.platform_installation_controls') IS NOT NULL AND to_regprocedure('public.hh_installation_pause_write_guard()') IS NOT NULL AS installed"},
  {id:"0019",file:"0019_primary_admin_and_guarded_operational_reset.sql",
   title:"Super Admin operational reset protections",
   gitBlobSha:"05c360e4d0681f591b0f26169d618a3e90c9f853",
   detectorSql:"SELECT to_regclass('public.platform_reset_jobs') IS NOT NULL AND to_regprocedure('public.hh_platform_reset_operational(uuid,uuid,jsonb,text,text)') IS NOT NULL AS installed"},
  {id:"0020",file:"0020_preserve_all_admins_on_reset.sql",
   title:"Preserve all administrators in school resets",
   gitBlobSha:"89f78180cb9168dad0b4d372e15cc9fbea18d02a",
   detectorSql:"SELECT to_regprocedure('public.hh_platform_reset_policy_version()') IS NOT NULL AND pg_get_functiondef(to_regprocedure('public.hh_platform_reset_policy_version()')) LIKE '%SELECT 2::integer%' AS installed"},
  {id:"0021",file:"0021_parent_contact_self_service.sql",
   title:"Guardian account contact self-service",
   gitBlobSha:"a0d19c900b24c7bb3896c125f660dcb7029c8090",
   detectorSql:"SELECT to_regprocedure('public.hh_parent_update_contact(text,text)') IS NOT NULL AS installed"},
]);

export const getApprovedMigration=(id:string)=>
  approvedMigrations.find(item=>item.id===id)??null;

export type MigrationState="applied"|"already_present"|"pending"|"blocked"|"drift";
export type MigrationStatus={
  id:string;title:string;state:MigrationState;
  appliedAt:string|null;source:"console"|"external"|null;
};
