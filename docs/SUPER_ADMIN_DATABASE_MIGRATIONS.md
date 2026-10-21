# Super Admin database migrations

## Goal
After a school's first administrator has been created, subsequent schema
upgrades belong in the **Super Admin → Database Migrations** panel, not in
routine copy/paste SQL Editor instructions. Only the original, uniquely
verified `PRIMARY` administrator can access or run this workflow. Co-Admins
continue to administer the school but cannot run schema-changing SQL.

**Bootstrap exception:** migrations 0001–0014 establish the users, school
and initial account infrastructure. A non-existent Super Admin cannot run
the migration required to create their own account. For a brand-new school,
the developer provisions this base schema and first administrator once.
The installed instance can then use this panel for approved upgrades
from 0015 onward.

## Developer-side configuration

Install the committed code and configure in the Vercel project:

```dotenv
MIGRATION_RUNNER_ENABLED=true
MIGRATION_DATABASE_URL=postgresql://<postgres-user>:<password>@<supabase-host>:5432/postgres?sslmode=require
```

These are **private server variables**. They must never have
`NEXT_PUBLIC_` prefixes, be sent to the browser, be committed to GitHub,
or be included in a ZIP patch.

Use the **same Supabase project as the application's pinned public URL**.
The application verifies the database hostname is that project's
`db.<project-ref>.supabase.co` host, or the matching official Supabase
**session pooler** with username `postgres.<project-ref>`. Configure
a restricted, TLS-verified connection and rotate leaked credentials.
DDL requires the PostgreSQL schema-owner privileges, which is why the
server must never accept user-supplied SQL text.

`MIGRATION_RUNNER_ENABLED` defaults off. Set it to false after a planned
upgrade window if you don't need ongoing application-side DDL capability.
The migration centre will report when this server-side feature is unavailable.

The approved SQL files are bundled into the Next.js server function with
`outputFileTracingIncludes`. Each release pins the Git blob checksum of
each exact SQL file in `lib/platform/migration-catalog.ts`.

## Super Admin steps

1. Sign in as the original `PRIMARY` administrator.
2. Open **Super Admin → Database Migrations**.
3. Use **Check migration status**. Results are:
   - **Applied by Super Admin**: recorded in the private migration history.
   - **Already installed**: an existing function/table proves a migration
     was previously applied outside the console.
   - **Next approved migration**: permitted next version.
   - **Waiting for earlier migration**: install prerequisites in order.
   - **Schema/checksum mismatch**: execution blocked; developer review.
4. Apply approved migrations in ascending order, one at a time.
   When the maintenance pause control (0018) is installed, first choose
   **Pause entire school portal**. The migration route stays accessible
   while the school is paused.
5. Check your independently restorable backup and staged results before
   applying a schema upgrade. Type `APPLY 0021`, for example, for the
   current next migration.
6. After a successful application, the app records the version, exact
   checksum, Super Admin user ID, school ID and timestamp in a separate
   private `hh_migration.applied_migrations` schema. It also writes an
   `audit_logs` event.
7. Refresh status and test core workflows. Once upgrades are complete,
   choose **Resume school portal**.

Only reviewed migrations 0015–0021 are currently in the catalogue. To
ship 0022+, the developer must commit the new reviewed SQL file, its
checksum and a safe postcondition in the manifest and release the code.
Adding `0022` to a browser request cannot run arbitrary SQL.

## Safety and failure handling

- The API authenticates the original `PRIMARY` admin, verifies there is
  exactly one such account, validates the request's Origin and confirmation,
  and verifies the account's role again directly in the target PostgreSQL DB.
- Connection identity is checked against the expected Supabase project.
- Every migration runs in one SQL transaction behind an advisory
  transaction lock. The outer `BEGIN/COMMIT` in a reviewed SQL file is
  removed only to let the runner enclose SQL + history + audit in a single
  atomic transaction. A failed postcondition or SQL statement rolls back
  and leaves no successful history entry.
- The migration runner denies out-of-order execution, reruns and checksum
  drift; it never runs SQL uploaded or typed in a browser.
- Previously manually installed updates can be recognized by specific
  database signatures; their appearance in the UI does not claim they were
  applied by this runner.
- If a migration fails because an installation has unusual legacy data,
  it stays pending, the portal remains paused when applicable, and
  the developer must examine the server log and migration preconditions.
  Do not weaken the protections to make it pass.
- Administrator-preservation migration 0020 must be present for
  operational reset; this remains independently enforced by the reset API.
- Super Admin migrations are different from **Reset operational school data**:
  normal migrations must not delete results, students or administrator
  accounts. Dangerous migrations require a separate reviewed release.

## Manual staging acceptance scenarios

These are not covered by GitHub unit tests alone. Run them against a
disposable, separate installation:

1. `PRIMARY` can view/apply 0020 then 0021 and see both applied in order.
2. `CO_ADMIN`, `PARENT`, `TEACHER` and unauthenticated requests receive
   no migration access.
3. An unexpected SQL ID or body is rejected.
4. A mismatched database URL is rejected without executing DDL.
5. A migration already applied manually displays **Already installed**.
6. The runner does not execute a later version while an earlier version is
   missing; applying a version twice is rejected.
7. When 0018 is installed, applying updates while the portal is active
   is blocked; during maintenance, Super Admin can use the console.
8. A database error rolls back the entire migration; there is no
   success record and existing school records stay unchanged.
9. Two concurrent migration requests cannot both proceed.
10. After upgrades, both PRIMARY and CO_ADMIN can sign in and published
    parent report cards remain accessible after the portal is resumed.
