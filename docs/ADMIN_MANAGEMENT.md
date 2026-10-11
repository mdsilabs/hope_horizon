# Administrative workflows

The admin sidebar now contains working **Classes & Subjects** and **Students**
pages. All API endpoints under /api/admin require an authenticated, active
ADMIN profile. Queries and writes are scoped to the logged-in school and
remain subject to Supabase Row Level Security.

## Order of setup
1. Apply the SQL migrations in order, **including 0004_harden_account_provisioning.sql**.
2. Create classes and subjects at /admin/classes, then assign subjects to
   each class. Results entry depends on these assignments.
3. Enrol student records at /admin/students. An enrolment is a record, NOT
   a Supabase Auth account or login. Name search, class filtering, pagination,
   editing and reversible deactivation are supported.
4. Only later provision student/parent logins through a trusted admin workflow.
   Do not enable public signup for this app.

## Security notes
- 0004 deliberately rejects new Auth accounts without trusted
  app_metadata.school_id and app_metadata.role set by the Supabase Admin API
  (service role). It does not trust client-editable user_metadata for roles.
- The seed script now sets those fields as app_metadata. All new staff/student/
  parent account provisioning code must follow the same pattern.
- Non-admins cannot update their role, school, account status, email,
  forced-password-change flag or auth ID via public.users.
- Inactive profile sessions are rejected in middleware and server-side
  session helpers. Class-subject assignments must remain within one school.
- Review any accounts provisioned before migration 0004 for suspicious role
  or school assignment. This migration does not reassign existing accounts.
- Server role checks protect the API, but database policies are the final
  line of enforcement.

## Not yet implemented
Teacher account provisioning/assignment screens, parent links and portal
logins for newly enrolled students, PDF/Excel exports, accounting and
real messaging-provider integration. Never distribute the demo passwords
or run the sample seed script against production data.

## Verification
CI runs validation tests, TypeScript checking and Next.js production build.
Database integration tests must be performed with a separate test Supabase
project, using a non-admin token and two different schools to verify isolation.
