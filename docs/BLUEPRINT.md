# Hope Horizon Academy — Student Results Management Portal
## Requirements Blueprint

This document captures the analysis and architecture decisions behind the
portal, corresponding to Prompt 1 of the original build spec. It is the
reference point for every decision made in the codebase.

---

## 1. Roles & Access

| Role | Summary of access |
|---|---|
| **Admin** | Full access: manage students, teachers, parents, classes, subjects, sessions/terms, grading scale, and system settings. Can also approve/publish results. |
| **Principal** | Reviews and approves/rejects submitted results before publishing. Full read access to results. |
| **Vice Principal** | Same result-approval powers as Principal (configurable per school policy). |
| **Teacher** | Enters/edits CA and exam scores only for the classes/subjects they are assigned to (`Teacher.subjectAssignments`). Submits results for approval. |
| **Student** | Read-only access to their own published results. |
| **Parent** | Read-only access to the published results of their linked children only (`Parent.studentIds`). |
| **Accountant** | Access to student records and a billing/fees module (placeholder in this build). |

Authorization is enforced at three layers: route-level (`middleware.ts`),
API-level (session + role checks in each Route Handler), and data-level
(queries always scope by `schoolId`, and for parents/students, by their
own linked IDs).

## 2. Multi-tenancy

Every core collection carries a `schoolId`. This allows the same codebase
to serve multiple schools from one database if needed, and keeps a clean
boundary for data isolation, even though the current build assumes a
single school (Hope Horizon Academy) is seeded.

## 3. Academic structure (configurable, not hard-coded)

- A school has one `academicStructureType`: `TERM`, `SEMESTER`, or `OTHER`.
- `academicPeriodLabel` controls what the UI calls a period ("Term",
  "Semester", etc).
- `periodsPerSession` controls how many periods make up a session (e.g. 3
  for a 3-term system) — nothing in the code assumes exactly 3 terms.
- `AcademicSession` (e.g. "2025/2026") contains one or more `Term`
  documents, each with `order`, `startDate`, `endDate`, and `isCurrent`.

## 4. Grading (configurable, not hard-coded)

- `School.gradingScale` is an array of `{ minScore, maxScore, grade, remark }`
  bands, fully editable by the Admin.
- `School.resultSettings.caMaxScore` / `examMaxScore` define default score
  ceilings; `Subject.caMaxScoreOverride` / `examMaxScoreOverride` allow
  per-subject exceptions (e.g. practicals).
- Grade computation (`services/gradingService.ts`) always looks up the
  school's configured scale — it never assumes a fixed A/B/C/D/F cutoff.

## 5. Result lifecycle

```
DRAFT → SUBMITTED → PENDING_APPROVAL → APPROVED → PUBLISHED
                                            ↓
                                          HIDDEN (can be unhidden by Admin)
```

- A teacher creates/edits a result in `DRAFT`.
- On submission it moves to `PENDING_APPROVAL`.
- An Admin, Principal, or Vice Principal (`RESULT_APPROVER_ROLES`) either
  `APPROVE`s (→ `APPROVED`, then published separately or auto-published
  per school policy) or rejects it (back to `DRAFT` with `rejectionReason`
  set, and the teacher notified).
- Only `PUBLISHED` results are visible to students/parents and are
  eligible for QR verification.
- `HIDDEN` lets an Admin retract a published result (e.g. to correct an
  error) without deleting the audit trail.

Every transition is recorded on the `Result` document itself
(`submittedBy/At`, `approvedBy/At`, `publishedBy/At`, `hiddenBy/At`) and in
the `AuditLog` collection.

## 6. Result access methods (for students/parents without full accounts)

`ResultAccessMethod` enumerates alternatives to username/password login:
registration number, admission number, student ID, scratch-card PIN, or
OTP. The current build wires up standard username/password login for all
roles; the alternate lookup methods are modeled and validated
(`lib/validations/auth.ts::resultLookupSchema`) as an extension point for
schools that prefer scratch-card-style result checking.

## 7. Notifications — channel restriction

**Only three channels exist: `EMAIL`, `WHATSAPP`, and `IN_APP`.** This is
intentional and enforced in four places simultaneously:
1. `types/enums.ts` (`NOTIFICATION_CHANNELS`, re-exported from `types/database.ts`)
2. `supabase/migrations/0001_init.sql` (Postgres `notification_channel` enum)
3. `lib/validations/notification.ts` (Zod enum)
4. `services/notificationService.ts` (exhaustive switch)

Do not add SMS or a "NONE" channel anywhere in the system.

## 8. Result verification (QR code)

Every published result is assigned a unique `qrVerificationCode`
(`services/qrService.ts`, via `nanoid`). The code resolves to a public,
unauthenticated verification page (`/result-verification?code=...`) that
confirms a result is genuine without exposing full score details to
random visitors — only student name, class, session/term, and school.

## 9. Audit logging

Every sensitive action (login/logout, result workflow transitions,
student/teacher CRUD, role changes, password resets) is written to
`AuditLog` with actor, action, entity, metadata, IP, and user agent.
Audit metadata must never contain passwords, tokens, or other secrets.

## 10. Non-functional requirements addressed in the foundation

- **Validation**: every write path is validated with Zod before touching
  the database (`lib/validations/*`).
- **Error handling**: a single `handleApiError` utility converts any
  thrown error (validation, auth, not-found, conflict, or unexpected) into
  a safe, consistent JSON shape — internal details are never leaked.
- **Security**: authentication is handled by Supabase Auth (bcrypt hashing,
  session cookies, and password-recovery flows are Supabase's
  responsibility, not custom code). Authorization is enforced in two
  independent layers: Postgres Row Level Security policies
  (`supabase/migrations/0002_rls_policies.sql`) are the primary boundary —
  a query simply returns no rows for data a role isn't allowed to see —
  and application code re-checks the same rules before privileged writes
  (see `services/resultService.ts`) since some rules (e.g. "a teacher may
  only touch subjects they're assigned to") are easier to express clearly
  in TypeScript than as a single SQL predicate.
- **Notifications** are dispatched through a single service with pluggable
  provider stubs for EMAIL and WHATSAPP.

---

This blueprint should be kept in sync with the codebase — if a workflow or
model changes, update this document alongside it.
