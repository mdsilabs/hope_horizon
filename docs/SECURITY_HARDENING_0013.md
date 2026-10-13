# Hardening pass: privileged RPC authentication (0013)

This is a **security-only** database migration, not a new feature.
All 11 existing privileged school-operation RPCs now require:

1. A real Supabase Auth user ID;
2. An active user profile;
3. `must_change_password=false`;
4. An active school.

This includes direct API calls, not just requests passing through Next.js
`requireRole`. The wrapped original functions still enforce their existing
admin/teacher/class/subject/school-specific permissions.

## Installation
Apply `supabase/migrations/0013_privileged_rpc_auth_guard.sql` once, after
0012, in the Hope Horizon Supabase project. Migration 0013 renames each
original function to `_internal`, revokes all ordinary user execute access
to the internal entry points, and creates public guarded RPCs with exactly
the same original argument names and return types. No tables or records
are deleted and the public API signatures do not change.

## Verification: staging
- Normal active, fully onboarded teacher/admin workflows still work.
- A Co-Admin with `must_change_password=true` gets SQLSTATE `42501`
  for every privileged RPC, even through direct Supabase REST calls.
- Inactive staff and a deactivated school receive the same denial.
- Original `*_internal` functions are not callable by `anon` or
  `authenticated`.
- Run end-to-end tests after this migration, especially account
  invitations, student/parent linkage, markbooks, term activation,
  compilation, approval, and publishing.

Repository checks validate SQL shape but do **not** execute Postgres migrations.
No live tenant claims are made until staging SQL verification passes.

## Additional privacy / audit controls
- **Profile isolation:** Students and parents can no longer list classmates'
  or school staff members' contact information via the broad historical
  `public.users` RLS policy. Their own profile remains available. Staff
  school-scoped reads remain intact.
- **Audit integrity:** Every direct authenticated insert to `audit_logs`
  must carry the current user's real ID and school. Regular student/parent
  users may only add login/logout audit events; staff approval/audit actions
  require school leadership permissions. Service-role and server-side
  privileged function audit writes continue to be possible.
- Test parent/student self profile and staff admin directory access after
  installing migration 0013.
