# Co-Administrators: equal permissions, original Admin protected

## Deployment
Apply `supabase/migrations/0008_co_admin_roles.sql` **once** after migration 0007
in the **Hope Horizon Supabase project**. The migration preserves all existing
`ADMIN` users as `PRIMARY`, and leaves other roles without an admin tier.
This conservative treatment prevents a migration from accidentally
demoting existing administrators.

## Create a Co-Admin
1. Sign in at `/login` as an existing Administrator.
2. Open **Co-Admins** from the admin sidebar (`/admin/co-admins`).
3. Enter the colleague's real name and email; choose **Create Co-Admin**.
4. The server securely creates a Supabase Auth user, with trusted
   `app_metadata.role=ADMIN` and `app_metadata.admin_tier=CO_ADMIN`.
5. The new Co-Admin receives a password-setup email **request**; actual
   receipt depends on Supabase Auth SMTP and `NEXT_PUBLIC_APP_URL` setup.
6. Co-Admin signs in through the existing `/login` page and receives the
   exact same ADMIN routes, dashboard and school-scoped RLS rights.

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
