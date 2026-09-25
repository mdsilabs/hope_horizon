# Hope Horizon Academy — Student Results Management Portal

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
# The three migrations in supabase/migrations/ can be run via the Supabase
# CLI (`supabase db push`) or pasted into the SQL editor in order:
#   0001_init.sql            — tables, enums, indexes
#   0002_rls_policies.sql    — Row Level Security policies
#   0003_auth_sync_trigger.sql — keeps public.users in sync with auth.users

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
