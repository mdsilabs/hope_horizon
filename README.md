## Class review and Gmail SMTP (migration 0010)

Class teachers now verify a complete student-by-subject score matrix,
request subject corrections and sign off before class submission. The
database enforces sign-off on compilation. Install migration
`0010_class_review_signoff.sql` after `0009`.

Portal emails use **Gmail SMTP** (server-only credentials in Vercel),
with a test button in Admin → Integrations. Supabase Auth SMTP is
configured separately in the Supabase dashboard. See
[Result compilation and Gmail configuration](docs/RESULT_COMPILATION.md).

## Subject-by-subject result compilation (2026-10)

Migration `0009_subject_class_compilation.sql` introduces transactional markbooks
for each subject, class-teacher compilation and head-of-school class approval.
Subject teachers use `/teacher/markbook`, class teachers use
`/teacher/compilation`, and the Principal uses `/principal/class-approvals`.
ADMIN/Co-Admin may access `/admin/class-approvals`.

See [Workflow and rollout](docs/RESULT_COMPILATION.md). This is distinct from
legacy per-student result entry, which is now blocked for teachers.

# Hope Horizon Academy — Student Results Management Portal

## Co-Administrators (2026-10)

After `supabase/migrations/0008_co_admin_roles.sql` is applied, manage
co-administrators under `/admin/co-admins`. These staff use the existing
ADMIN permissions but are marked with an unchangeable `CO_ADMIN` tier.
Existing Admin accounts become protected `PRIMARY` administrators.
See [Co-Admin setup](docs/CO_ADMIN_SETUP.md).



## User profiles and Cloudinary images

After applying `supabase/migrations/0007_profile_cloudinary.sql` (after 0006),
users can update their own name/contact details at `/profile`.
Administrators can review and edit school account contact details at
`/admin/users` and manage Cloudinary at `/admin/media`.
School-specific cloud names, upload folder and enabled status are persisted
in Supabase. Cloudinary API credentials remain server-only in Vercel environment
variables, not in GitHub or the database.

See [Profile / Cloudinary setup](docs/PROFILE_CLOUDINARY_SETUP.md).



## Student and family logins (2026-10)

Administrators can now activate logins for enrolled students from `/admin/students`,
and create parent accounts / manage linked children at `/admin/parents`.
Accounts are provisioned using Supabase Auth's privileged server-only API
with trusted `app_metadata`; no reusable or temporary passwords are ever
displayed. Setup emails use Supabase Auth password recovery with a
configured `NEXT_PUBLIC_APP_URL` and Supabase Auth SMTP.

**Important:** Apply `supabase/migrations/0006_family_account_integrity.sql`
after 0001–0005 on the existing database before inviting any families.
It adds guards against cross-school parent-child links, enforces student
account ownership, and provides atomic parent-child relationship updates.
See [Family account setup](docs/FAMILY_ACCOUNT_SETUP.md).



## School onboarding and settings (2026-10)

The first administrator now lands on a dashboard with a database-backed school
setup progress panel. Visit `/admin/setup` to complete school contact details,
the current academic period, classes, subject assignments, teacher assignments
and student enrollment. Use `/admin/settings` to update the school identity,
academic structure and score limits with safeguards for existing periods and results.
See [School setup center](docs/SCHOOL_SETUP_CENTER.md).


## First administrator login (2026-10)

**Do not run the demo seed on a real school database.** After applying SQL
migrations 0001–0005, the database still needs its very first school and
ADMIN Auth account. On Windows, install dependencies with `npm install`,
then double-click `scripts/bootstrap-admin.cmd`. The masked setup wizard
accepts an administrator name, email, strong password and a newly rotated
Supabase server secret key. It provisions at most one initial administrator
and never commits or stores credentials. Afterwards sign in at `/login`.

See [First administrator setup](docs/FIRST_ADMIN_LOGIN.md) for details.

## Teacher and academic setup (2026-10)

Administrator features now include `/admin/teachers`, `/admin/academic`, and
`/admin/integrations`. Apply migrations **0004 and 0005** in order after the
original three, configure `NEXT_PUBLIC_APP_URL`, service-role key, and Supabase
Auth SMTP. For the Windows integration GUI, double-click
`scripts/check-integrations.cmd` in a cloned repository.

See [Teacher, academic and integration setup](docs/TEACHER_ACADEMIC_SETUP.md).



A multi-role results management portal built with **Next.js (App Router,
TypeScript)**, **Supabase (Postgres + Auth)**, and **Tailwind CSS**.

This build implements the full requirements/foundation/database phases of
the original spec, migrated onto Supabase, plus the core result-entry and
approval workflow screens:
1. **Blueprint** — see [`docs/BLUEPRINT.md`](./docs/BLUEPRINT.md) for the full
   requirements analysis and architecture rationale.
2. **Foundation** — project setup, UI kit, routing, validation, error
   handling, and notification dispatch scaffolding.
3. **Database architecture** — the full Postgres schema
   (`supabase/migrations/`) with Row Level Security policies enforcing
   every role's access at the database layer, not just in application code.
4. **Result workflow** — teachers enter/edit draft results, submit them for
   approval, Principals/Vice Principals/Admins approve or send them back
   for correction, and Admins/Principals/VPs publish approved results
   (generating a QR verification code) so students and parents can view them.

## Stack

- Next.js 15 (App Router) + TypeScript
- Supabase (Postgres, Auth, Row Level Security)
- Tailwind CSS
- react-hook-form + Zod for forms/validation
- @supabase/ssr + @supabase/supabase-js for auth/session handling
- framer-motion, lucide-react, recharts for UI
- exceljs (bulk upload/export), qrcode + nanoid (result verification)

## Getting started

```bash
# 1. Install dependencies
npm install

# 2. Configure environment variables
cp .env.example .env.local
# Get these from your Supabase project's Settings -> API page:
#   NEXT_PUBLIC_SUPABASE_URL
#   NEXT_PUBLIC_SUPABASE_ANON_KEY
#   SUPABASE_SERVICE_ROLE_KEY  (server-only — never expose to the browser)

# 3. Apply the database schema (if not already applied to your project)
# The five migrations in supabase/migrations/ can be run via the Supabase
# CLI (`supabase db push`) or pasted into the SQL editor in order:
#   0001_init.sql            — tables, enums, indexes
#   0002_rls_policies.sql    — Row Level Security policies
#   0003_auth_sync_trigger.sql — initial profile sync trigger
#   0004_harden_account_provisioning.sql — trusted account authorization metadata
#   0005_teacher_academic_workflows.sql — assignment and period transactions

# 4. Seed demo data (creates one school + one auth user per role)
npm run seed

# 5. Run the dev server
npm run dev
```

Visit `http://localhost:3000`. Demo accounts created by the seed script
(password for all: `ChangeMe123!`):

| Role | Email |
|---|---|
| Admin | admin@hopehorizon.test |
| Teacher | teacher@hopehorizon.test |
| Student | student@hopehorizon.test |
| Parent | parent@hopehorizon.test |

All seeded accounts have `must_change_password: true` in their metadata —
wire up a forced password-change flow before going to production.

## Project structure

```
app/                    Next.js App Router pages & API routes
  (public)/             Login, forgot-password, reset-password, result-verification
  admin/ teacher/ ...    One folder per role, each with its own layout
    results/            Result list/entry/detail pages (teacher, admin)
    approvals/           Approval queue + detail pages (principal, VP)
  api/                  Route Handlers (auth, results workflow, verification)
components/
  ui/                   Design-system primitives (Button, Input, Modal, ...)
  layout/               Sidebar, Topbar, DashboardShell
  teacher/               Result entry form
  results/              Shared result detail card + approve/publish actions
lib/
  auth/                 Session helpers (Supabase Auth), RBAC helpers
  supabase/             Browser, server, and admin (service-role) clients
  validations/          Zod schemas for every write path
  utils/                Error handling, cn() classnames
services/               Result workflow, grading, QR codes, notifications, audit logging
supabase/migrations/    The three SQL migrations — the schema's source of truth
scripts/seed.ts         Demo data seed script
docs/BLUEPRINT.md       Full requirements/architecture writeup
middleware.ts           Route-level auth guarding + Supabase session refresh
```

## Result workflow

```
DRAFT → PENDING_APPROVAL → APPROVED → PUBLISHED
                                ↓
                              HIDDEN (admin can retract; audit trail preserved)
```

- **Teacher** (`/teacher/results`): enters/edits a draft, then submits it.
- **Principal / Vice Principal** (`/principal/approvals` or
  `/vice-principal/approvals`): reviews pending results, approves or sends
  them back with a reason. Approved results can be published from the same
  screen.
- **Admin** (`/admin/results`): full visibility across every status, plus
  the ability to publish or hide any result.
- **Student / Parent** (`/student/results`, `/parent/results`): see only
  their own (or their linked children's) **published** results — enforced
  by Row Level Security, not just page-level checks.

## Authorization: RLS + application checks

Every table has Row Level Security enabled
(`supabase/migrations/0002_rls_policies.sql`). A student querying another
student's result simply gets no row back — this holds even if a future
API route forgets to filter explicitly. Application code
(`services/resultService.ts`) re-checks the same rules for a few
finer-grained cases (like "a subject teacher may only score their own
subject") that are clearer to express in TypeScript than as one SQL policy.

## What's implemented vs. what's a stub

**Implemented:**
- Full Postgres schema for schools, users, students, parents, teachers,
  classes, subjects, sessions/terms, results, notifications, and audit logs.
- Supabase Auth login / logout / forgot-password / reset-password flows.
- Role-based route protection via middleware, plus per-role dashboard
  shells and home pages with live counts from the database.
- The full result entry → submit → approve/reject → publish → hide
  workflow, end to end, with real screens for every role.
- Public, unauthenticated result verification via QR code.
- A complete, reusable UI kit and centralized validation/error handling.

**Left as an intentional stub / next step:**
- Full CRUD screens for students/teachers/classes/subjects (the schema,
  RLS policies, and validation are ready — admin management UI is not yet
  built beyond what's needed to demo the result workflow).
- EMAIL and WHATSAPP provider integration (`services/notificationService.ts`
  has clearly marked `TODO` stubs).
- PDF result-sheet generation and bulk Excel import/export (`exceljs`,
  `qrcode` are installed and ready; the routes are not yet wired up).
- Billing/fees module for the Accountant role (placeholder page only).
- Class position recalculation (`services/resultService.ts::recalculateClassPositions`)
  is implemented but not yet triggered automatically from the UI — call it
  after a batch of results in a class is approved.

## Notification channels

Only three notification channels are supported anywhere in this system:
**EMAIL**, **WHATSAPP**, and **IN_APP**. This is enforced at the type,
Postgres enum, validation, and service layers — do not add SMS or a "none"
channel; see `docs/BLUEPRINT.md` §7 for details.
