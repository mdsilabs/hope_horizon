# Hope Horizon | Teacher irregularity requests

## Purpose
A school sometimes discovers a missing student or an incorrect score after a
teacher has submitted a markbook or after class results have already been
published. This workflow collects and tracks requests safely. **A request never
edits student records or published marks directly.** Administrative endorsement
is not the same as implementation.

## Deploy
1. Commit the code to the Hope Horizon repository (already tracked).
2. After applying migrations 0001-0014, execute
   `supabase/migrations/0015_teacher_irregularity_requests.sql`
   **once** in the correct Supabase project's SQL Editor.
3. Redeploy the latest `main` branch to Vercel.
4. Confirm the assigned class teacher for every class under Admin → Teachers.
   There must be **exactly one active class teacher** for routing. If none or
   multiple are assigned, request submission fails with a clear error.

## Teacher guide
1. Teacher dashboard → **Class Requests** (`/teacher/irregularities`).
2. Choose an assigned class and academic term. Current term is the default,
   but historical terms remain selectable.
3. The UI shows the **named class teacher** the request will be routed to.
4. Choose one of:
   - **Add missing student**: name, admission number and explanation.
   - **Correct subject marks**: assigned subject, enrolled student, proposed
     CA and examination marks, explanation.
5. Submit. The app confirms the record; the class teacher receives an
   in-app notification.
6. The teacher can track the request, review dates, outcome, class teacher's
   comment, and administrator's decision. All events remain in the timeline.
7. A teacher cannot directly overwrite a locked markbook or published
   result using this process.

## Class-teacher review
- In the same **Class Requests** page, the designated class teacher sees
  requests from teachers of the class.
- The class teacher may endorse to the admin or reject with a reason
  (at least ten characters).
- If a class teacher submits their **own** request, it bypasses self-review
  and goes directly to an independent school administrator.

## Administrator review
- Admin → **Class Requests** (`/admin/irregularities`).
- Filter: pending review, approved waiting for implementation, all.
- Review teacher, class teacher, request content, reason and notes.
- Approve or reject; the requesting teacher and class teacher receive
  in-app notification of the decision.
- An approved request remains **APPROVED_PENDING_APPLICATION**.
  No student has been added, and no mark has been edited by this workflow.

## Why approval does not automatically mutate published records
Existing Hope Horizon release controls require complete class approval and
publication as a whole. Changing one student's score after release affects
compiled totals, grades, positions, QR-verified reports and potentially the
positions of other students. Adding a student likewise may affect class-wide
submission completeness. A safe *application* workflow must:
- preserve a verifiable before/after record;
- re-evaluate class marks, grading bands and positions in a single transaction;
- obtain a fresh authorized review and signed approval;
- publish only through an explicit authorized release path;
- avoid changing results merely because a class teacher clicked 'endorse'.

Until that dedicated amendment transaction is implemented and tested, an
administrator must use the school's authorized student-management and
result-review procedures with appropriate documented approvals. Do **not**
manually bypass locked-result triggers or alter published results with SQL.

## Data and security
- RLS allows only the requesting teacher, currently assigned class teacher
  or school administrators to see a request, always within one school.
- Database functions authorize by `auth.uid()`, active role, school and
  current assignment. The browser cannot forge a request's reviewer or status.
- No direct insert/update/delete table grants are given to authenticated users.
- Requests and event timelines remain after published terms or school
  term changes; normal result cleanup does not delete them.
- Notification messages deliberately exclude individual pupil names/scores.
- Database migration modifies only the new request/event tables and functions,
  not historic grades, identities, publications or existing marks.

## Acceptance tests
- Assigned subject teacher can submit missing student request on an already
  published class and see the chosen class teacher's name.
- Teacher can submit a correction request for an enrolled pupil and assigned
  subject; submitted/published source marks remain unchanged.
- Unassigned teachers cannot create or view another class's requests.
- No class teacher, or multiple active class teachers: submission fails closed.
- The class teacher can endorse/reject a request and see it leave the queue.
- Class teacher cannot approve their own request; it routes to Admin.
- Admin can approve or reject, with a recorded actor/timestamp and event history.
- Student/parent accounts cannot read teacher irregularity requests.
- Results remain published and unchanged even after admin request approval.
