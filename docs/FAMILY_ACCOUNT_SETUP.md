# Student and parent account rollout

Project: **supabase-cyclamen-park** (`iwfpdwihinhcwjgvmfei`).
Do not apply migrations to any other project.

## Before inviting families
1. Apply `supabase/migrations/0006_family_account_integrity.sql` **once**
   in the Supabase SQL Editor, after the original migrations 0001–0005.
2. Configure a newly rotated `SUPABASE_SECRET_KEY` **server side** in Vercel.
   Do not expose secret keys as `NEXT_PUBLIC_`, paste them into a browser
   form, or commit them to GitHub.
3. Set `NEXT_PUBLIC_APP_URL` to the actual HTTPS website origin in Vercel.
4. Configure **Supabase Auth SMTP** and allowlist your site's
   `/reset-password` URL under Supabase Authentication URL Configuration.
5. Deploy the updated application and sign in to `/admin`.

## For students
- Enrol a student first at `/admin/students`. Enrolment does not create
  a login automatically.
- Click **Create login** for an active enrolled student, enter the email
  owned by that student (or a guardian if school policy permits), and
  submit.
- The server creates a Supabase Auth account with a random undisclosed
  password and trusted STUDENT role and school metadata.
- Only the matching enrolled student record is linked. A second attempt
  cannot silently replace an existing login.
- A setup email is requested; if email is not configured, the account
  still exists but cannot be used until a successful password setup.
- Click **Email setup** to request a new password setup link.

## For parents
- Visit `/admin/parents`, choose **Add parent** and enter full name,
  email and optional phone.
- Search for existing enrolled students and select the children this
  parent is allowed to access. At least one child is required.
- Parent role is set through trusted Auth app_metadata, not client input.
- The migration's `hh_admin_replace_parent_children` procedure replaces
  links **atomically**, rejecting children outside the parent's school.
- Use **Change links** to update the allowed children, and **Resend setup
  email** when necessary.
- Parent result pages continue to show only **PUBLISHED** results for
  linked children, enforced by existing RLS policies.

## Existing schema and security
Migration 0006 adds:
- A unique index for a student's linked Auth user ID.
- A trigger rejecting student logins with a mismatched school or role.
- A trigger rejecting cross-school parent/child links at the database
  boundary, even if a client bypasses the web API.
- An admin-authorized, transactional function for updating a family's
  child links. No public role/anonymous role can execute it.

These are new DB integrity guards, not a replacement for manually auditing
already-existing records if your database previously contained them.

## Verification
GitHub CI checks validation tests, typechecking and the Next.js build.
A real cross-school, password recovery and SMTP delivery test must be done
against staging before real parents and students are invited.
If the email provider does not work, do **not** distribute the generated
random password. Fix delivery and resend instead.
