# Hope Horizon · Parent portal and platform owner controls

## Parent portal (no new family migration)
The existing family junction `parent_students(parent_id,student_id)` permits
multiple students per parent and multiple guardians for the same child.
Migration 0006 already enforces same-school linking and replaces the full
child set atomically.

- School administrator → **Parents & families** (`/admin/parents`): create
  an account, select 1–50 distinct active linked students, edit links later.
- Parent → **Dashboard** (`/parent`): counts of children, published results,
  unread notifications, and links for each child.
- Parent → **My Children** (`/parent/children`): every linked child, class,
  admission number, most recent *published* academic results, report links.
- Parent → **Results** (`/parent/results`): select **All children** or one
  child using a child-scoped filter.
- Parent → **Notifications** (`/parent/notifications`): parent-only inbox and
  per-message mark-read.
- Parent result detail `/parent/results/[id]` explicitly verifies
  membership, same school and `PUBLISHED` status before fetching detail.
  Database RLS independently enforces the same restrictions.

No parent may self-link an unverified student. School staff must verify
guardianship before adding or removing a link.

## Platform owner (vendor super-admin)
There is deliberately **no** automatic equivalence between a school's
PRIMARY administrator and the platform owner. Each school receives its own
installation. An explicit **server-only** owner authorization connects the
school instance to a privileged vendor-controlled Auth account:

```env
PLATFORM_SUPERADMIN_AUTH_USER_ID=<AUTH_USER_UUID>
PLATFORM_INSTALLATION_SCHOOL_ID=<THIS_INSTALLATION_SCHOOL_UUID>
```

Both IDs are configured privately under Vercel Production Environment
Variables. Never put the owner identifier into NEXT_PUBLIC variables. The
vendor owner must still be an **active ADMIN account in that school** with
completed password setup. Without both settings, owner controls are not
available to anyone. Deploy the migration before the updated middleware.

## Install pause controls

1. Back up/verify the database and read migration
   `supabase/migrations/0018_installation_pause_controls.sql`.
2. Execute migration 0018 *once* after 0017. It creates
   `platform_installation_controls` with `paused=false` by default,
   and installs the `hh_installation_pause_guard` trigger on the
   existing public application tables.
3. Configure the two owner environment variables above and redeploy
   the latest main.
4. Sign in as the configured owner. Admin sidebar → **Platform Owner**
   (`/admin/platform-control`).
5. To **Pause**: supply a public reason (10–350 characters), type
   `PAUSE <school name>` exactly, then confirm. The API checks the
   configured owner, origin and school. The maintenance switch persists
   in PostgreSQL across Vercel deployments.
6. While paused, end-user pages redirect to `/system-paused` and
   Next.js APIs return 503. Auth routes and the owner dashboard remain
   available so the owner can recover and resume. The database-level
   trigger blocks all `authenticated`-JWT public table writes, including
   writes via direct Supabase APIs or privileged RPCs. Database service
   role and SQL Editor are deliberately available for emergency recovery.
7. To **Resume**: return to Platform Owner and type
   `RESUME <school name>`, then confirm.

### Full reset safety

The owner dashboard contains a **read-only reset impact preview** with
record counts and a **locked** destructive action. It does NOT execute a
full reset, delete Supabase Auth users, erase published results or remove
backup/audit history. This is intentional until the owner decides whether
`all data` means **school operational content only** or also includes
school branding/configuration, authentication accounts, immutable audit
history and the owner account.

A future destructive action must additionally require a verified
independently restorable backup, explicit school and installation scope,
dual authorization, exact expected-row counts, an irreversible typed
phrase, no active maintenance-write traffic, transactional verification
and documented Supabase Auth and Storage cleanup. Do not expose a
general-purpose TRUNCATE or service-role SQL input box over HTTP.

### Recovery / limitations
- If the UI cannot resume, a database operator with legitimate SQL Editor
  access may set `paused=false` in the singleton maintenance table.
  Do not disable row-level security or drop triggers as a workaround.
- A maintenance pause blocks web portal views and authorized application
  writes but cannot retroactively revoke downloaded reports, or stop
  reading Supabase rows through an existing direct API token if RLS permits.
- Future migrations adding public tables must apply the pause guard.
- Existing users and school records are preserved at every stage.
