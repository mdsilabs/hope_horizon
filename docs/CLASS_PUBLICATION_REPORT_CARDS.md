# Class-wide publication and printable report cards

## Deployment
Install `supabase/migrations/0011_class_release_report_cards.sql`
**once**, after migrations 0001 through 0010, in the pinned Hope Horizon
Supabase project. The installation runs inside a transaction.

CI checks code, static SQL contracts and a production Next.js build; it does
**not** execute migration 0011 against a live project. Test on a staging class
before releasing any real students' results.

## What changes
- Class teachers enter term attendance and remarks for every active pupil
  using `/teacher/compilation/[classId]/attendance`. Attendance is validated
  for every pupil: present + absent = school days (1–366); a teacher remark
  of 3–500 characters is required per pupil.
- Attendance edits invalidate an earlier class-teacher review signature.
  A database trigger rejects sign-off unless all active pupils have attendance
  and remarks. A second trigger rejects class compilation if attendance is
  missing, even if an API request bypasses the UI.
- The existing class compilation transaction copies the verified attendance
  and remarks into each compiled student result. School-head approval now
  records the **actual approving officer's name and decision timestamp**
  as an electronic approval attribution, not a forged handwritten image.
- Admin and Principal use `/admin/class-releases` or
  `/principal/class-releases` to publish the **whole approved class**.
  The server verifies every pupil, every subject score, attendance, remarks,
  and the head's recorded approval. A single SQL transaction changes
  all results to PUBLISHED, creates QR verification codes, records audit,
  and queues in-app family notices. If any check fails, no result is released.
- Admin can **withdraw an entire published class**, also transactionally.
  Withdrawal hides all class results from family views and QR verification.
  Re-release after withdrawal is intentionally blocked pending formal review.
- Old individual `/api/results/[id]/publish` and `hide` endpoints
  are disabled for compiled classes. Legacy independent results keep their
  original workflow. Existing mixed legacy class releases are marked
  `LEGACY_MIXED` and require reconciliation before bulk release.

## Report cards
- Open **Print report card** on the student/parent result page or
  **Preview / Print report card** on an administrator's approved result.
- Browser Print allows printing A4 or **Save as PDF**.
- Includes school identity/logo, session and term, student/admission number,
  subject CA, exam, total and grade, class position/average (if allowed
  by school settings), attendance, teacher remarks, head remarks, and
  the exact named approving officer and timestamp.
- A scannable QR verification link appears only for published results
  when `NEXT_PUBLIC_APP_URL` is set to the correct HTTPS origin.
- Approved but unreleased staff previews are marked **NOT RELEASED**.
  Students and parents only reach PUBLISHED reports through RLS.
- The electronic sign-off uses a verified name and timestamp. A true
  handwritten signature image is **not** generated or invented.

## Email and notification behavior
Family publication messages are created as **IN_APP** notifications inside the
same database transaction. Sending thousands of Gmail SMTP emails synchronously
would cause request timeouts and Gmail quota problems. Email bulk dispatch is
intentionally not implemented here. Existing school Gmail SMTP configuration
remains valid for smaller workflow notifications and account setup via
separately configured Supabase Auth SMTP.

## Staging verification checklist
1. Apply 0011 to a staging database after 0010.
2. Submit complete markbooks, enter all pupils' attendance/remarks and
   sign off the class. Confirm missing attendance blocks sign-off.
3. Compile, approve and check that a real approver name/date is saved.
4. Publish class; check all pupils published at once, and that linked parents
   can only view their own children's cards.
5. Print A4, verify QR and school identity.
6. Withdraw; confirm family pages and QR verification no longer expose reports.
7. Verify direct single-result publication and withdrawal endpoints reject a
   compiled class, including requests made with a valid admin session.
8. Confirm older legacy results remain unchanged and mixed legacy batches
   require reconciliation.
9. Confirm Gmail SMTP is **not** used for automatic class-wide mass mail.
