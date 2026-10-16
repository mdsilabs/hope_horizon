# Isolated QA: results workflow with 10 students and 5 subjects

This is a **staging-only, destructive workflow rehearsal**. Run against a NEW, DEDICATED Supabase project with **no real school data**, not the pinned Hope Horizon production project `iwfpdwihinhcwjgvmfei`.

## Single-SQL staging installation (recommended for a NEW QA project)

If you want one SQL script instead of manually applying fourteen files, use
[`supabase/staging/hope_horizon_all_migrations_and_staging.sql`](../supabase/staging/hope_horizon_all_migrations_and_staging.sql).
It combines original migrations **0001 through 0013** and creates a QA school,
session, term, class, five subjects **and ten student academic records**.

**Important:** Only run this complete bundle in a **new, empty, dedicated
staging Supabase project**. It rejects databases with existing school tables
or Auth accounts. Open the script, verify the destination project, then
**uncomment the `SET LOCAL hh.qa_staging_confirm` line** near the beginning.
If you leave it commented, the script intentionally fails without changes.

Run the bundle once using Supabase SQL Editor. Then skip manual steps 2 and 3
below and proceed directly to account provisioning (step 4). The SQL does
**not** create login passwords, Auth users or linked family/staff accounts,
because those must be securely created by the Supabase Auth Admin API. The
staging provisioner will link the ten pre-created student academic records
to Auth accounts, create staff and parent accounts, and assign one shared
temporary password from `STAGING_TEST_PASSWORD`.

Do not run the bundle on production or on any database with previously
applied migrations.

## Preconditions

1. Create a dedicated staging Supabase project (separate URL, publishable key and server secret).
2. Apply the project's standard migrations **0001 through 0013** in order to the staging project. Do not apply the old bundled install scripts on top of existing migrations.
3. In the staging project's SQL editor, execute `supabase/staging/qa_results_fixture.sql` once. It creates one QA-only school, 2026/2027 session, First Term, one JSS 1 QA class and exactly five subjects. It rejects a database already containing a different school.
4. Create a local `.env.local` or shell environment with these variables, never commit secrets:

```env
ALLOW_STAGING_SEED=true
STAGING_SUPABASE_URL=https://YOUR-STAGING-REF.supabase.co
EXPECTED_STAGING_PROJECT_REF=YOUR-STAGING-REF
STAGING_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_STAGING_PUBLISHABLE_KEY
SUPABASE_SECRET_KEY=YOUR_STAGING_SERVER_SECRET
STAGING_TEST_PASSWORD=YOUR_SHARED_STRONG_TEMPORARY_STAGING_PASSWORD
```

> `.env.local` is not automatically loaded by the standalone scripts. Export the variables in your shell or use your shell's safe environment-loading procedure. `dotenv/config` automatically loads `.env` only. Never use production Supabase secrets or publicly share the common test password.

5. Run `npx tsx scripts/seed-results-staging.ts` once. It provisions **1 administrator, 1 principal, 1 class teacher, 5 subject teachers, 10 students, and 10 linked parents**. Accounts share the private value of `STAGING_TEST_PASSWORD` for QA only. Staff/student/parent email addresses end in `@example.test`, so no real email delivery is expected.
6. Run `npx tsx scripts/verify-results-staging.ts` once to exercise **real authenticated Supabase RPCs**, not privileged writes to the results table.

## Staging web deployment

To connect a separate staging deployment of the application to QA Supabase, configure:

```env
NEXT_PUBLIC_HOPE_HORIZON_STAGING=true
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-STAGING-REF.supabase.co
NEXT_PUBLIC_STAGING_PROJECT_REF=YOUR-STAGING-REF
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_STAGING_PUBLISHABLE_KEY
SUPABASE_SECRET_KEY=YOUR_STAGING_SERVER_SECRET
```

The production deployment must **not** set `NEXT_PUBLIC_HOPE_HORIZON_STAGING=true`. Its existing pinned Supabase project behavior is unchanged.

## Test logins

All use the value of `STAGING_TEST_PASSWORD`, not a committed password.

- Administrator: `qa.admin@example.test` (withdrawal)
- Principal: `qa.principal@example.test` (approval/publication)
- Class teacher: `qa.class.teacher@example.test` (corrections, attendance, sign-off and compilation)
- Subject teachers: `qa.teacher.mat@example.test`, `qa.teacher.eng@example.test`, `qa.teacher.bsc@example.test`, `qa.teacher.soc@example.test`, `qa.teacher.ict@example.test`
- Students: `qa.student.01@example.test` through `qa.student.10@example.test`
- Parents: `qa.parent.01@example.test` through `qa.parent.10@example.test`

## One-shot verification checklist

The runner submits 50 markbook rows across five subjects, requests a correction on one submitted subject, verifies premature correction clearance is blocked, resubmits the corrected subject, clears the request, saves each pupil's attendance/remarks, signs off 50 marks, compiles 10 student results, obtains principal approval, publishes all 10 atomically, verifies first student/parent can each see exactly one result, then withdraws all 10 and confirms family access disappears.

This runner intentionally **consumes the QA term workflow**. It cannot be rerun on the same seeded class after withdrawal; recreate a fresh isolated staging database for another full run. The scripted checks cover database rules; browser tests must separately inspect the report-card PDF/A4 layout, mobile screens and QR scanning.

Never run this fixture on the client's production project or reset production data. Shared test passwords must never be used for real accounts.

## Release signoff

Do not mark the contract complete until the staging script passes, GitHub CI passes, the QA report cards print correctly, invalid/withdrawn QR codes fail, and the client approves user acceptance testing.
