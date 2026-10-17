# Supabase Auth email links: production URL setup

Production website: **https://hopehorizonacademy.vercel.app/**

If password setup or password recovery emails send recipients to
`http://localhost:3000/?code=...`, fix BOTH Supabase Auth URL Configuration
and the deployed app's `NEXT_PUBLIC_APP_URL`. A database migration does
**not** configure Supabase Auth redirect destinations.

## 1. Supabase Auth URL configuration

Open the Supabase project connected to Hope Horizon:
`iwfpdwihinhcwjgvmfei` (`supabase-cyclamen-park`).

Under **Authentication → URL Configuration**:

- **Site URL**: `https://hopehorizonacademy.vercel.app`
- **Redirect URLs**, add exact entries:
  - `https://hopehorizonacademy.vercel.app/reset-password`
  - `https://hopehorizonacademy.vercel.app`

Do not depend on `http://localhost:3000` as the production Site URL.
Keep localhost allowlist entries only where local development actually needs
them. Prefer exact URLs to open-ended wildcards.

If your **Authentication → Email Templates** have been customized, verify
that email confirmation/recovery templates do not hard-code localhost and
do not discard an explicit `{{ .RedirectTo }}` in favor of a hard-coded
`{{ .SiteURL }}` path. The standard `{{ .ConfirmationURL }}` link typically
handles the configured redirection.

## 2. Vercel environment

Under **Vercel → Hope Horizon project → Settings → Environment Variables**:

```env
NEXT_PUBLIC_APP_URL=https://hopehorizonacademy.vercel.app
```

Set for **Production** and redeploy the production deployment. If you have
a separate preview/staging deployment, give it its own valid HTTPS URL.
The app now refuses to generate recovery links pointing to localhost from
a production build.

This is NOT the Supabase API URL. Keep the existing Supabase project pinned;
do not replace `NEXT_PUBLIC_SUPABASE_URL` with your Vercel site.

The connected Supabase/Vercel integrations may not grant access to this
project's settings. These two dashboard steps must be completed by an owner
who has access.

## 3. Verify

1. Request a **new** link from
   `https://hopehorizonacademy.vercel.app/forgot-password` or from a
   teacher/student/parent **Send setup email** action.
2. Open the new link in the same browser profile where it was requested when
   PKCE requires local verifier state.
3. Verify the destination is
   `https://hopehorizonacademy.vercel.app/reset-password?code=...`
   (or a recovery hash fragment). It must not be localhost and must not
   land on the unhandled homepage `/?code=...`.
4. Choose a new password, sign out and confirm you can sign in.
5. Don't share real recovery links: their code is a one-time credential.

If the link still goes to the wrong URL, recheck Supabase's exact redirect
allowlist and whether a custom email template overrides `redirectTo`.
If your browser shows an invalid/expired link, request another one.

## Code and protection

- `lib/auth/recovery-redirect.ts` validates the redirect origin.
- `lib/admin/account-onboarding.ts` centralizes all setup-email URLs.
- `app/api/auth/forgot-password/route.ts` and
  `app/api/admin/teachers/[id]/send-setup/route.ts` use the same validator.
- Other admin account setup endpoints already call the shared validator.

These guards prevent accidentally *requesting* wrong recovery links, but they
cannot update Supabase's dashboard-managed Site URL and allowed redirect list.
