# School Setup Center
After first admin login, visit `/admin/setup` (also linked on the dashboard and sidebar).

Six database-backed milestones:
1. School contact details: `/admin/settings`
2. Current session and term: `/admin/academic`
3. Active class: `/admin/classes`
4. Subject linked to an active class: `/admin/classes`
5. Subject/class assigned to an active teacher: `/admin/teachers`
6. Active enrolled student: `/admin/students`

These milestones are evaluated against records scoped to the authenticated administrator's
school; no demo data or new migrations are required. The readiness page is not a
claim of production safety: email, provider integrations and RLS should still be tested.

## School settings

`/admin/settings` lets administrators edit school identity, levels, contact
information, web address, academic structure, CA/exam score limits and simple
basic grading limits. The `/api/admin/school` GET/PATCH route validates values on the
server, checks ADMIN role and updates **only the session school ID** using
the signed-in user's RLS-scoped Supabase client. Inputs cannot choose another
school ID. Audits log changed field names, not PII values.

Safeguards:
- CA and exam maxima must total 100.
- Changing academic structure, period label or number of periods is forbidden
  once academic terms exist.
- Changing CA/exam maxima is forbidden once results exist.
- No secrets are ever requested by school settings.
- All changes are school-scoped. Cross-school writes require separate test
  validation using two test school profiles and Supabase RLS.

## Verification

CI runs unit validation and build tests. Actual database-backed queries and
writes still require a connected staging Supabase project for end-to-end testing.
