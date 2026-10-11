# Teacher provisioning, academic calendar, integration checks

## Before trying the UI
1. Set Vercel project environment variables:
   - NEXT_PUBLIC_SUPABASE_URL
   - NEXT_PUBLIC_SUPABASE_ANON_KEY (Supabase's anon/publishable key)
   - SUPABASE_SERVICE_ROLE_KEY (server-side only; never NEXT_PUBLIC_)
   - NEXT_PUBLIC_APP_URL (the actual deployment origin, HTTPS)
2. In the Supabase project used by Hope Horizon, apply SQL migrations
   0001, 0002, 0003, 0004, then 0005, in order.
   0004 is required to prevent client-editable metadata from granting roles.
   0005 adds atomic, privileged teacher assignments and academic term activation.
3. Configure **Supabase Auth SMTP** for password setup emails. The application's
   SMTP_* env vars are *not* a substitute for Supabase Auth's SMTP configuration.
   Supabase Auth URL Configuration must allow the exact
   NEXT_PUBLIC_APP_URL/reset-password URL.
4. Sign in with an existing administrator. No public teacher signup is allowed.
5. Use /admin/integrations to check database tables, Auth administration and
   migration capabilities without changing records.

## Teacher onboarding
- /admin/teachers -> Add teacher: enter name, email, staff ID.
- Server generates an undisclosed random password; creates the Supabase Auth
  user with trusted app_metadata and the school-scoped teacher profile.
- Server asks Supabase Auth to email a password reset link. A successful
  email request is not proof of delivery. If failed, use **Resend setup email**.
- Select a teacher and choose assigned classes plus exact subjects per class.
- The assignment transaction requires an active class and subject from the
  same school; the subject must be attached to that class under /admin/classes.
- Student enrolment and teacher onboarding are independent.

## Academic calendar
- /admin/academic -> create a session, e.g. 2026/2027, with dates.
- Add ordered terms within that session. Term dates must fit session dates.
- Select **Set current** next to the term you are conducting.
- A single database transaction updates school pointers and both current flags.
  New results now use the selected session/term. Existing historical results
  remain associated with their original period.

## Integration UI script (Windows)
From a cloned copy of the GitHub repository, double-click:
  scripts\check-integrations.cmd
The PowerShell Windows Forms GUI checks:
- .env.local presence and required variable names (no values shown);
- presence of node/npm;
- HTTPS reachability of Supabase Auth and REST endpoints;
- optional site /login endpoint.
It does not validate database RLS, send emails or apply migrations.
For authenticated, read-only server/database checks use /admin/integrations.

## Important limitations
- **Do not apply migrations to an unrelated Supabase project.** Identify the
  correct Hope Horizon project before running the SQL.
- 0005 procedures must be installed before staff assignments and activation work.
- Teacher create and Auth setup mail require the Supabase service-role key;
  never expose it to the browser or commit it.
- Tests and builds do not prove that a real Supabase instance, external email
  provider or Vercel deployment is working. Verify those in an isolated test
  school first.
- Teacher provisioning does not yet offer re-activating/deactivating teacher
  accounts or changing their login emails from the UI.
