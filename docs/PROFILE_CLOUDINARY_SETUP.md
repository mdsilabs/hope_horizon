# Hope Horizon: user profiles and Cloudinary integration

## Deploy migration 0007
On `supabase-cyclamen-park` (`iwfpdwihinhcwjgvmfei`), apply
`supabase/migrations/0007_profile_cloudinary.sql` **once**, after all prior
migrations 0001 through 0006.

Migration 0007 adds `users.avatar_url`, `users.avatar_uploaded_at` and
`school_media_settings` with school-administrator-only RLS.
The database rejects direct avatar URL changes from authenticated browser
sessions: avatars can only be written by the verified server-side upload
endpoint. No secrets are stored in SQL.

## Server credentials (Vercel)
In **Vercel Project → Settings → Environment Variables**, set:

```env
CLOUDINARY_API_KEY=your_rotated_key
CLOUDINARY_API_SECRET=your_rotated_secret
CLOUDINARY_CLOUD_NAME=your_cloud_name
```

All three are SERVER-ONLY. No `NEXT_PUBLIC_` prefix. Do not paste the secret
into the administrator UI, GitHub, or a SQL editor. Redeploy after updates.

## Administrator UI
1. Sign in as an ADMIN and open **Cloudinary** in the sidebar, or
   **School Settings → Configure Cloudinary**.
2. Enter the **Cloudinary cloud name**, choose a single folder name (default
   `avatars`) and enable uploads.
3. Click **Save configuration**; these public identifiers are stored for the
   authenticated school only.
4. Click **Test connection**. This performs an admin-authorized Basic Auth
   request to Cloudinary's read-only image resource listing endpoint. No
   image is created during the test.
5. Users can upload on **My profile**. Files are validated on the server:
   up to 3 MB; JPG, PNG or WebP; file magic must match MIME. Stored prefix:
   `hope-horizon/<school UUID>/<folder>/<random ID>`.
6. The server-only Cloudinary secret is never sent to a browser.
   Avatar URLs are populated exclusively from a validated Cloudinary response.

## Profile management
- All roles can edit their own full name, phone and WhatsApp number at
  `/profile`; the profile menu links there.
- Admins can search school accounts and edit their name/phone/WhatsApp at
  `/admin/users`. School, email, role and active status are read-only.
- Cloudinary avatar uploads are only for the authenticated user's own
  profile. No arbitrary remote URL input or client-driven folder selection.

## Verification and limitations
- CI validates Zod schemas, TypeScript types and production Next.js build.
- Run live checks in staging after SQL 0007, including Cloudinary read-only
  connection test, real image upload, and two-school data isolation.
- No Cloudinary secret is persisted in Supabase, and this initial rollout
  does not include file deletion or a full media library.
- A prior avatar is not automatically deleted when a new avatar is uploaded.
