# Co-Administrators: equal permissions, original Admin protected

## Deployment
Apply `supabase/migrations/0008_co_admin_roles.sql` **once** after migration 0007
in the **Hope Horizon Supabase project**. Also apply **migration 0012** after 0011 to protect temporary credentials and enable both creation methods. Migration 0008 preserves all existing
`ADMIN` users as `PRIMARY`, and leaves other roles without an admin tier.
This conservative treatment prevents a migration from accidentally
demoting existing administrators.

## Create a Co-Admin
1. Sign in at `/login` as an existing Administrator.
2. Open **Co-Admins** from the admin sidebar (`/admin/co-admins`).
3. Enter the colleague's name and email, then choose one setup option:
   **Temporary password (default)**: No email is sent. A secure random
   password is displayed in the UI **once**. Share it privately, then
   the Co-Admin signs in at `/login` and changes it at `/change-password`.
   **Email setup link**: A recovery/setup email is requested through
   Supabase Auth. Configure Gmail SMTP separately in Supabase Authentication
   and allowlist `/reset-password`.
4. Both methods create the same trusted Supabase Auth claims:
   `app_metadata.role=ADMIN` and `app_metadata.admin_tier=CO_ADMIN`.
5. The first private password must be set before the new Co-Admin
   receives any application or database RLS permissions.
6. The original PRIMARY administrator remains protected in both cases.

## Safeguards
- Primary Admins have `admin_tier=PRIMARY`; Co-Admins are `CO_ADMIN`.
- The database rejects deletion, deactivation, role reassignment or
  school/tier changes of primary administrators.
- The database rejects changing **any** user's role, tier or school via
  an existing user update (including authenticated direct Data API calls).
- The Auth provisioning trigger requires a trusted tier and disallows
  creation of new primary administrators after a school's first admin.
- Admin management requests can **deactivate/reactivate only Co-Admins**
  in their own school, never a primary admin or their own account.
- Deactivation preserves an audit trail and avoids deleting email identities.
- Co-Admins may invite other Co-Admins as part of their equal
  administrative privileges, but cannot remove a Primary Admin.
- Privileged server credentials must remain in server-only Vercel environment
  variables, never in browser JavaScript, SQL files or Git history.

## Important limitation
Database superusers in Supabase's management dashboard can alter database
triggers or run privileged maintenance. The guarantee applies to app users,
even administrators or Co-Admins, and application-exposed endpoints.
Safeguards prevent the app's privileged Auth deletion endpoint from
cascading away a primary `public.users` row.

## Test in staging
- Original Admin logs in, creates a Co-Admin, setup email arrives.
- Co-Admin can access the usual ADMIN pages and school resources.
- Co-Admin cannot deactivate a Primary Admin (UI and API).
- Co-Admin cannot delete a Primary Admin (database trigger and Auth cascade).
- Co-Admin can deactivate/reactivate another Co-Admin, but not self.
- Co-Admin cannot edit school ID, role, or primary designation via REST.
- Inactive Co-Admin cannot use the dashboard despite old browser cookies.

The tests and build run in GitHub CI. Live tenant-isolation and migration
verification must be performed against the actual Supabase project.


## Enforced first-login security (migration 0012)
- A Co-Admin created by either method has `must_change_password=true`.
- The app redirects pending users to `/change-password`, and the
  `requireSession` function refuses pending staff API access.
- More importantly, migration 0012 makes school/role RLS helper functions
  return NULL until the password is changed, including direct Supabase REST.
- The trusted app server clears the flag **only after** Supabase Auth
  confirms that the password update succeeded.
- The flag cannot be cleared from the browser via a direct SQL Data API
  update. Server secrets never appear in the browser.
- Direct temporary passwords are displayed only in the account creation
  response and not stored in plain text in GitHub, PostgreSQL or audit logs.
- Email setup remains optional; existing Co-Admins can still request a
  setup email if Gmail SMTP is configured.

## Test
- Create Co-Admin with temporary password while Gmail SMTP is disabled.
- Copy password once and sign in; confirm redirect to /change-password.
- Confirm ordinary admin pages and direct Supabase RLS queries deny access
  until the password is replaced.
- Change password, sign in again and verify ADMIN rights.
- Create another Co-Admin through email flow; follow reset link and set
  password, then confirm admin access.
- Confirm the original PRIMARY admin remains undeletable.
