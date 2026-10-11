# Subject Markbook -> Class Compilation -> Head Approval

## Status
Migration `0009_subject_class_compilation.sql` provides a new, school-scoped,
transactional result workflow. Apply it **after 0008**, not over the original
migration bundle. An existing class with legacy draft or finalized results for
the current term is **blocked** from new compilation rather than overwritten.
Those legacy entries need administrator reconciliation before transitioning.
This migration does not automatically change or delete historical results.

## Workflow
**Step 1: Subject teacher** at `/teacher/markbook`
- Must have an active teacher profile and a subject assignment to that class.
- One markbook per class, subject and active term.
- Captures CA and exam marks for every active student in that class.
- Server validates the current academic period, exact class membership,
  subject assignments, score ceilings and duplicate entries.
- Draft marks can be revised. **Submit** locks that subject's marks until a
  class is returned for correction by the head.

**Step 2: Class teacher** at `/teacher/compilation`
- Needs an active `teacher_classes` class assignment.
- Progress shows submitted subject marks / all required subject marks.
- Compilation requires at least one active student and subject, and **every
  active student must have a submitted mark in every active class subject**.
- One SQL transaction calculates totals, averages, class positions and school
  grades, writes student result sheets, and submits the entire class.
- Compilation cannot overwrite existing legacy drafts or finalized results.

**Step 3: Head of school** at `/principal/class-approvals`
- Reviews individual score breakdowns and positions in the whole class.
- `PRINCIPAL` and `ADMIN` (including Co-Admin) can approve/return;
  `VICE_PRINCIPAL` is not allowed in the new class approval workflow.
- **Approve class** atomically approves every compiled student result.
- **Return class** requires a reason, reopens all its subject marks as drafts,
  and allows subject teachers to correct and resubmit. The previous compiled
  drafts are replaced only after a complete new submission.
- Direct per-student approval is blocked for compiled batches.

**Step 4: Publishing**
- Approved results remain **unpublished** until the existing authorized
  publication action is taken. Published results are visible to linked
  students and parents. Future work: an atomic entire-class release, bulk
  PDF report cards and publication scheduling.

## Setup
1. Update the GitHub project and redeploy on Vercel.
2. Open the pinned Supabase project's SQL Editor.
3. Paste the entire `supabase/migrations/0009_subject_class_compilation.sql`
   file **once**, after migrations 0001-0008.
4. Under Admin > Teachers, attach each class subject to its subject teacher,
   and mark the responsible class teacher using **Assigned classes**.
   (Current model permits more than one assigned class teacher; choose one
   primary responsible teacher operationally until class assignment UI enforces
   a single owner.)
5. Confirm classes have enrolled active students, assigned active subjects,
   and an active academic term.
6. Test with a sample class: each subject teacher submits; class teacher
   compiles; Principal approves/returns; Admin publishes approved results.

## Security model and limitations
- No direct Data API INSERT/UPDATE/DELETE grants for subject marks or batch
  approvals. Only authenticated, guarded SQL RPCs can write them.
- School, role and assignments are derived from `auth.uid()`, never a
  client-controlled role/school identifier. Each RPC rejects inactive users.
- An inactive staff member cannot write via any of these RPCs.
- RLS permits teacher read access only to assigned subject markbooks or their
  own class, with Principal and Admin school-wide access.
- The old per-student teacher draft creation/submission path is disabled.
- The existing `/admin/results` still publishes approved student results
  individually, not as a scheduled class release.
- Existing legacy records are retained; migrating them to class compilation
  requires an explicit reconciliation step.
- Live Supabase migration, cross-school tests and role-specific classroom
  simulations **must be completed before a real-term rollout**. Passing
  GitHub build checks does not confirm a live school is configured correctly.

## Class-teacher score matrix and sign-off (migration 0010)

The improved class-teacher screen at `/teacher/compilation/[classId]` lets the
class teacher inspect every student's CA, examination and total in a complete
student-by-subject matrix, and see Missing / Draft / Submitted states.

- Request a **subject-specific correction** with an explanation before compiling:
  only that subject's submitted marks reopen; other subjects remain locked.
- The subject teacher sees the correction request in Subject Markbook and
  resubmits the entire corrected subject, and receives an in-app notification.
- After the resubmission, the class teacher checks the marks and clicks
  **Verify resubmission** to clear the flag.
- The class teacher checks the matrix and explicitly **Signs off** the
  complete class. Every subsequent mark change invalidates sign-off.
- Database trigger **rejects any compilation without a fresh sign-off**,
  including requests that bypass the UI.
- All actions have audit records. Existing 0009 class batches are not altered.

Apply migration `supabase/migrations/0010_class_review_signoff.sql` once,
after 0009. Until it is applied, the new review page and sign-off cannot work.

## Gmail SMTP setup

**Portal notifications** use SMTP from the Next.js server via Nodemailer.
Set Vercel's private server environment variables (not browser settings):

```env
EMAIL_PROVIDER=gmail
EMAIL_FROM=your-school-gmail@gmail.com
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=your-school-gmail@gmail.com
SMTP_PASSWORD=your-gmail-app-password
```

- Gmail App Passwords require Google 2-Step Verification and may be unavailable
  for some managed accounts. Use a **dedicated school sender account**.
- Port 465 uses implicit TLS; 587 uses STARTTLS and is also supported.
- The app does **not** store or reveal SMTP passwords in the Admin panel.
- In Admin → Integrations, use **Test Gmail SMTP**. It sends a single
  message to the authenticated Admin's email, with a five-minute cooldown.
- Class-teacher correction requests and class submissions create IN_APP
  notifications; configured Gmail SMTP additionally attempts email.
  Failure to send an email does not reverse a successfully committed SQL action.
- **Supabase Auth invitations and password recovery are configured separately.**
  In Supabase Dashboard → Authentication → SMTP Settings, configure the
  same Gmail SMTP sender and App Password and allowlist the site's recovery URL.
  Vercel SMTP env vars alone do not configure Supabase Auth.
- Gmail rate limits and anti-abuse controls apply; large-scale school mail
  may need a dedicated transactional provider later.
