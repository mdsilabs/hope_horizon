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

## Super Admin: original school administrator

The first ADMIN created by the school's bootstrap wizard has
`admin_tier='PRIMARY'`. This immutable designation (migration 0008) now
**automatically identifies the Super Admin**; no owner UUID environment
variable is required. Co-Admins have `admin_tier='CO_ADMIN'` and can never
pause, resume, or reset the installation.

Migration 0019 establishes a unique PRIMARY designation per school.
If older records contain multiple PRIMARY administrators it fails closed:
a DBA must investigate and resolve that legacy ambiguity before reset
features can be activated. Do not guess the original admin or promote
a Co-Admin.

## Deployment steps

1. Back up and restore-test the Supabase database independently.
2. Apply `0018_installation_pause_controls.sql` if not yet applied.
3. Apply `0019_primary_admin_and_guarded_operational_reset.sql` **once**,
   followed by `0020_preserve_all_admins_on_reset.sql` **once**.
   Both migrations are non-destructive on installation. **0020 is required**:
   the web reset endpoint refuses to run against the older 0019 policy.
   If a legacy reset Auth-cleanup job is pending, migration 0020 stops for
   manual reconciliation rather than guessing which administrator to delete.
   Then apply `0021_parent_contact_self_service.sql` for guardian contacts.
4. Deploy the latest `main` to Vercel.
5. Sign in as the original PRIMARY Administrator and open
   `/admin/platform-control`. This link is shown only to that user.
6. To enable the destructive reset button, additionally set the
   **server-only** environment variable `PLATFORM_ENABLE_OPERATIONAL_RESET=true`
   in the installation's Vercel Production settings, then redeploy.
   The reset remains disabled unless this explicit operator gate is active.

## Pause and resume

- A pause requires a reason and typing `PAUSE <school name>` exactly.
- It blocks public portal pages, application API access and authenticated
  school-data writes at the database layer. This includes direct Supabase
  RPC writes from users. The owner login/control route and database recovery
  remain available.
- Resume requires typing `RESUME <school name>` exactly.
- An incomplete operational reset prevents resuming the school. The owner
  must complete the queued Auth deletion first.

## Reset **operational data only**

**Preserved:** EVERY administrator's account and credentials, including
the original PRIMARY and all CO_ADMIN accounts (active or inactive);
the `schools` row (name, branding, contacts, grade configuration, academic
structure); Cloudinary/media configuration; Supabase Auth/project keys;
audit history; the maintenance switch; reset receipts.

**Deleted:** classes, subjects, academic sessions and terms, teaching
assignments, students, staff/teacher profiles, parents and parent-child links,
non-administrator application user profiles, marks, results and published
report data, requests, release approvals, and school notifications.
The active academic session and term pointers become NULL because the
selected records no longer exist. The Super Admin can start fresh setup.

**Not automatically deleted:** externally stored images in Cloudinary,
Supabase Storage objects, external payment/finance providers and backup
archives. A separate provider-scoped media cleanup must be handled after
review. The reset does not delete other schools in a multi-school database.

### How to initiate

1. Use the Super Admin account, verify the current school, and pause it.
2. Refresh the exact operational-row counts. Review the records listed.
3. Verify that you hold an **independently restorable database backup**.
   Enter its unique backup reference. The app stores your attestation, but
   cannot independently prove the backup can be restored.
4. Acknowledge that this destroys operational records and type:
   `RESET OPERATIONAL DATA FOR <school name>`
5. Submit **Reset operational school data**. Both Next.js and the database
   independently verify the original Primary identity, active pause, school
   ID, exact live row counts and confirmation phrase.
6. The database performs all scoped deletes in **one transaction**; if a
   constraint, table-layout change or count check fails it rolls back.
7. A durable `platform_reset_jobs` record tracks Supabase Auth accounts
   remaining for removal. Click **Continue account cleanup** for batches
   (up to 12 accounts). If a user owns Storage objects or Auth deletion
   fails, the school stays paused until recovery/retry.
8. After the Auth cleanup reaches zero, type the explicit RESUME phrase to
   reopen the school. The Super Admin can recreate classes/staff/accounts.

**Two-phase warning:** Supabase Auth deletion and the SQL transaction are not
atomic with each other. Do not resume the school until account cleanup reports
completed. Old JWTs without a school profile should not be permitted access
through normal application RLS, but a security review is still required
before production reset use. This high-impact feature should be exercised
first on a disposable staging installation with representative data.

### Protection and recovery

- All sensitive API routes authorize the **PRIMARY** account and require
  same-origin requests; DB RPCs are granted to service role only.
- The full reset function refuses any unknown future public tables to
  avoid leaving an unrecognized dataset behind.
- All ADMIN account profiles are preserved, and
  the database refuses reset unless there is exactly one active PRIMARY.
- Audit logs are preserved, and user references to deleted accounts are
  nulled where defined by existing schema.
- A failed database cleanup raises a PostgreSQL exception and rolls back.
- If Auth cleanup gets stuck, investigate Auth/Storage dependencies and
  retry; avoid manual deletion outside the recorded job without documenting.
- The schema/reset functions do not remove the platform itself.
- If the owner dashboard cannot resume, an authorized DBA may restore
  `paused=false` in `platform_installation_controls` **only after confirming
  no pending reset Auth cleanup**.

### Acceptance testing (staging, before production)

- PRIMARY can see owner link; CO_ADMIN, parents and teachers cannot.
- The PRIMARY and every CO_ADMIN account retain their profile, login and tier after reset, including inactive/pending co-admins.
- All school settings and Cloudinary integration remain.
- Counts become zero across all operational tables and other schools remain.
- A count change after preview aborts; an unknown public table aborts.
- Missing backup evidence or typed confirmation aborts.
- No school can resume while Auth cleanup is incomplete.
- Failed Auth deletions are retryable without re-erasing the database.

## Parent portal completion (0021)

- Administrators now have a visible **Parents & Families** sidebar link at
  `/admin/parents`. They can link multiple active students to one guardian.
- Parents sign in with their individual guardian account and see **Dashboard**,
  **My Children**, **Results**, **Notifications** and **Guardian Account**.
- The dashboard and My Children page include direct, named child profile
  links. `/parent/children/[id]` lists that child's published historical
  term results, attendance on approved reports and printable cards.
- `/parent/results?childId=...` offers a sibling switcher and only retrieves
  linked, published reports. Unpublished, hidden and unrelated children's
  records are never returned.
- `/parent/account` reads the guardian's name and login email from the
  school-verified profile, and allows self-editing only phone/WhatsApp.
  The database RPC `hh_parent_update_contact` updates both the matching
  parent and user contact records atomically with a school/role guard.
  Guardians cannot self-link children, alter admission numbers, grades or
  modify any other family's details.
- Password and login email changes use the existing secure account recovery
  process; school staff must verify guardian identity before changing links.

### Important status distinctions

Automated unit/CI checks cannot prove that Supabase migrations are present
on your chosen school instance or that a real guardian can log in and view
multiple children. First apply the SQL migrations in order to a **separate
staging Supabase instance**. Validate the following using two households
with two students each: parent A sees both their children but not parent B's
children; published results work and withdrawn results disappear; guardian
phone edits appear on both User and Parent profiles; Co-Admins remain after
an operational reset; unrelated school data remains unchanged.
Never test the destructive reset against the production school.
