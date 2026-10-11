# Hope Horizon: first administrator and sign-in

Project: **supabase-cyclamen-park** (`iwfpdwihinhcwjgvmfei`).

## Prepare
- Migrations **0001–0005** must be installed in the correct Supabase project.
- Do not run the demo seed on this project.
- Rotate the privileged credentials previously shared in chat. Get a **new**
  Supabase `sb_secret_...` from **Supabase Dashboard → Settings → API Keys**.
- This key bypasses database RLS. Do not add it to source control, screenshots,
  messages, a public browser page, or a `NEXT_PUBLIC_` environment variable.
- Install **Node.js 22 or later** and run `npm install` in the cloned project.

## Windows graphical setup
1. Double-click `scripts/bootstrap-admin.cmd`.
2. In the UI, enter school name, your administrator name and email, and a
   strong administrator password. The password is **chosen by you**, not
   hardcoded in the repository. You need it for the next step.
3. Enter your **newly rotated Supabase secret key** into the masked field.
   The key and password are passed to the local script in memory; neither is
   stored or passed on the command line.
4. Click **Create first administrator**, then confirm.
5. When confirmed, open your deployed site at `/login`, or
   `http://localhost:3000/login` when using `npm run dev`.
6. Sign in using the email and password you just chose. Your role is
   `ADMIN`; successful sign-in routes to `/admin`.

## What the bootstrap script does
- Uses only the pinned Supabase project.
- Checks `public.users` for any existing `ADMIN`. If one exists, it stops,
  preventing a second initial administrator.
- Reuses the sole existing school if present. If there are no schools, it
  creates Hope Horizon Academy and its default grading scale. If more than one
  school exists, the form requires an existing school UUID.
- Creates the Supabase **Auth** account through the privileged Admin API with
  `app_metadata.school_id` and `app_metadata.role="ADMIN"`.
- Confirms the matching school-scoped `public.users` record was created by
  the hardened migration-0004 trigger.
- Auto-confirms the administrator's email for the first local setup; SMTP
  email delivery is **not required** for initial password sign-in.
- Removes a newly created account and/or school if verification fails,
  whenever rollback is possible. If rollback fails it reports that manual
  review is required.
- No public `/api/setup` endpoint or public admin-signup page is created.

## Troubleshooting
- **Admin already exists:** use `/login` with that admin's email, or
  `/forgot-password` if Supabase Auth email is configured. Do not rerun setup.
- **Incorrect password:** check the exact password you entered in the wizard.
- **Profile verification failed:** ensure migrations 0001–0005 completed and
  `public.handle_new_auth_user()` is the hardened version from 0004.
- **Cannot create account:** check that the server secret key is valid for the
  pinned project, email is not already registered in Supabase Auth, and
  network access is working.
- **Database empty after SQL installation:** migrations create structures, NOT
  the first school or admin account. The wizard creates these.
- **Login redirects to /:** confirm the `ADMIN` profile is active, and the
  Vercel deployment points to the same pinned Supabase project.

## Future administrator accounts
After the first bootstrap, additional administrators should only be created
through an authenticated, explicitly authorized admin-management workflow.
This bootstrap tool is not a general-purpose privilege escalation mechanism.
