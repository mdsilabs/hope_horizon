# Current academic term result data cleanup (Hope Horizon)

**Status: prepared, NOT executed.** Only run against the correct Supabase
database after a complete backup. This removes exam and result data for
**one school and its current academic term only**, not all school records.

## Data that will be deleted for the selected current term

| Table | Data |
|---|---|
| `public.subject_markbooks` | Subject teachers' CA/exam entries and submission locks |
| `public.class_result_batches` | Pending/approved/released class batches and principal approval attribution |
| `public.results` | Compiled student results, totals, averages, positions, attendance and remarks copied to the results |
| `public.result_subject_scores` | Per-subject result scores, calculated grades and subject positions |
| `public.class_subject_corrections` | Results review/correction requests |
| `public.class_result_review_signoffs` | Class teacher review sign-offs |
| `public.class_report_entries` | Attendance and teacher remarks saved in class report workflow |

Nothing is replaced with new or blank grades. The current term's result
workflow becomes **empty**, ready for teachers to enter marks again from
scratch.

## Preserved

- School settings, academic sessions, term definitions and current-term selection
- All user accounts, students, teachers, principal/admin roles, and parent links
- Class and subject records, class-subject links, teacher assignments
- Exam-independent audit and notification history
- Any results or workflow records belonging to **another term**, even in the
  same academic session, and any records belonging to **another school**

**Note:** Historical in-app notification messages and audit entries are
intentionally preserved for accountability. Some may mention deleted results.
If a report was previously published, recipients might already have saved
a copy; this cleanup cannot recall downloaded/printed copies.

## Safe procedure

1. **Back up your Supabase project, including `public` and `auth`**, using
   a proven backup/restore method. Check that restoration would be possible.
2. Open the correct Hope Horizon Supabase project in **SQL Editor**.
3. Execute **`preview_current_term_results_cleanup.sql`**. This is read-only.
   Note the selected school name and the following values from its row:
   - `school_id`, `session_id`, `term_id`
   - `results`, `subject_markbooks`, `class_result_batches`
   - `scope_consistent` must be `true`
   - `published_or_hidden_results` and `released_or_legacy_batches`
4. Open **`cleanup_current_term_results_GUARDED.sql`** and fill:
   `v_school_id`, `v_expected_session_id`, `v_expected_term_id`,
   `v_expected_results`, `v_expected_markbooks`, `v_expected_batches`.
5. Set `v_confirmation` to exactly
   `DELETE_THIS_SCHOOL_CURRENT_TERM_RESULTS`.
6. If the preview showed published or hidden results, or released/legacy
   batches, additionally set `v_publication_confirmation` to exactly
   `DELETE_EXISTING_PUBLICATIONS_TOO`. Otherwise leave its default.
7. Run the cleanup script **without altering its final `ROLLBACK;`**.
   The transaction performs a rehearsal, verifies row counts, emits
   `NOTICE` messages and then rolls every deletion back.
8. Only after reviewing those messages and the intended school/term,
   replace the **final** `ROLLBACK;` with **`COMMIT;`** and run it once.
   Confirm that no error occurred and the transaction committed.
9. Run the original read-only preview again. All seven result counts for
   the selected term should be zero; school and term IDs should be unchanged.
   Verify historical results in a separate term as well.

## Safeguards implemented

- Requires explicit school UUID, academic session UUID and term UUID.
- Refuses to run if the school's current term/session no longer matches.
- Checks that the term belongs to the correct school/session.
- Requires fresh count matches for results, markbooks, and class batches.
- Refuses published/withdrawn histories without a separate confirmation.
- Checks for unexpected foreign keys to result tables.
- Holds a transaction lock on the school and its classes during cleanup.
- Deletes only seven strictly school-and-term-scoped result datasets.
- Verifies all deleted row counts against the preflight state.
- The delivered executable script ends in `ROLLBACK;`, NOT `COMMIT;`.

**Limitations:** Source migrations have been inspected and static safety tests
were added, but the scripts have **not** been executed on the user's live
Supabase database. Unknown production-only triggers or constraints could
still prevent a cleanup; if so, the transaction should be rolled back.
The database audit log remains the historical record of workflow actions.

No Vercel redeployment or new schema migration is required merely to run
this SQL cleanup. Do not change the production SQL script or run it
before confirming a working backup.
