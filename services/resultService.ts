import { createAdminClient } from "@/lib/supabase/admin";
import { computeSubjectScore, computeOverall, computeClassPositions } from "./gradingService";
import { generateVerificationCode } from "./qrService";
import { sendNotification } from "./notificationService";
import { recordAuditEntry } from "./auditService";
import type { CurrentSession } from "@/lib/auth/getCurrentSession";
import { canApproveResults } from "@/lib/auth/rbac";
import { AuthorizationError, ConflictError, NotFoundError, ValidationError } from "@/lib/utils/errors";
import type { ResultInput, ResultApprovalInput } from "@/lib/validations/result";
import type { Database } from "@/types/database";

type ResultRow = Database["public"]["Tables"]["results"]["Row"];

/**
 * Note on RLS vs. this service: RLS policies (supabase/migrations/0002_rls_policies.sql)
 * are the primary enforcement layer and would already block most of what
 * this file additionally checks. This service uses the admin client and
 * re-checks authorization explicitly anyway, for two reasons: (1) some
 * rules — like "a teacher may only touch subjects they're assigned to
 * within a class" at the individual-subject-score level — are easier to
 * express clearly in application code than in a single RLS predicate,
 * and (2) using the admin client here lets one service call cleanly
 * update multiple related tables (results + result_subject_scores +
 * notifications) in a single logical flow without RLS partially blocking
 * one of the writes.
 */

/**
 * Confirms a teacher is allowed to enter scores for the given class and
 * subjects — either they hold a matching subjectAssignment, or they are
 * the class's assigned class teacher (who may enter all subjects), or
 * they hold an elevated role (Admin/Principal/Vice Principal) who can
 * enter/correct any result.
 */
async function assertTeacherCanEnterResult(
  session: CurrentSession,
  classId: string,
  subjectIds: string[]
): Promise<void> {
  const role = session.profile.role;
  if (["ADMIN", "PRINCIPAL", "VICE_PRINCIPAL"].includes(role)) return;
  if (role !== "TEACHER") {
    throw new AuthorizationError("Only teachers or school administrators can enter results.");
  }

  const supabase = createAdminClient();
  const { data: teacher } = await supabase
    .from("teachers")
    .select("id")
    .eq("user_id", session.authUserId)
    .eq("school_id", session.profile.school_id)
    .single();

  if (!teacher) {
    throw new AuthorizationError("No teacher profile is linked to your account.");
  }

  const { data: classTeacherRow } = await supabase
    .from("teacher_classes")
    .select("class_id")
    .eq("teacher_id", teacher.id)
    .eq("class_id", classId)
    .maybeSingle();

  if (classTeacherRow) return; // class teacher may enter all subjects

  const { data: assignments } = await supabase
    .from("teacher_subject_assignments")
    .select("subject_id")
    .eq("teacher_id", teacher.id)
    .eq("class_id", classId);

  const assignedSubjectIds = new Set((assignments ?? []).map((a) => a.subject_id));
  const unauthorizedSubject = subjectIds.find((id) => !assignedSubjectIds.has(id));
  if (unauthorizedSubject) {
    throw new AuthorizationError(
      "You are not assigned to enter results for one or more of these subjects."
    );
  }
}

/** Creates a new draft result, or updates an existing draft one for the same student+session+term. */
export async function saveDraftResult(session: CurrentSession, input: ResultInput): Promise<ResultRow> {
  await assertTeacherCanEnterResult(
    session,
    input.classId,
    input.subjects.map((s) => s.subjectId)
  );

  const supabase = createAdminClient();
  const { data: school } = await supabase
    .from("schools")
    .select("grading_scale")
    .eq("id", session.profile.school_id)
    .single();
  if (!school) throw new NotFoundError("School not found.");

  const computedSubjects = input.subjects.map((s) => ({
    subjectId: s.subjectId,
    ...computeSubjectScore(s.ca, s.exam, school.grading_scale),
  }));
  const { overallTotal, overallAverage } = computeOverall(computedSubjects);

  const { data: existing } = await supabase
    .from("results")
    .select("*")
    .eq("student_id", input.studentId)
    .eq("academic_session_id", input.academicSessionId)
    .eq("term_id", input.termId)
    .maybeSingle();

  if (existing && existing.status !== "DRAFT") {
    throw new ConflictError(
      "This result has already been submitted and can no longer be edited directly. Ask an approver to reject it first if changes are needed."
    );
  }

  let result: ResultRow;

  if (existing) {
    const { data, error } = await supabase
      .from("results")
      .update({
        class_id: input.classId,
        overall_total: overallTotal,
        overall_average: overallAverage,
        attendance_present: input.attendance?.present,
        attendance_absent: input.attendance?.absent,
        attendance_total_days: input.attendance?.totalDays,
        teacher_remarks: input.teacherRemarks,
      })
      .eq("id", existing.id)
      .select()
      .single();
    if (error || !data) throw new Error(error?.message || "Failed to update result.");
    result = data;

    await supabase.from("result_subject_scores").delete().eq("result_id", result.id);
  } else {
    const { data, error } = await supabase
      .from("results")
      .insert({
        school_id: session.profile.school_id,
        student_id: input.studentId,
        class_id: input.classId,
        academic_session_id: input.academicSessionId,
        term_id: input.termId,
        overall_total: overallTotal,
        overall_average: overallAverage,
        attendance_present: input.attendance?.present,
        attendance_absent: input.attendance?.absent,
        attendance_total_days: input.attendance?.totalDays,
        teacher_remarks: input.teacherRemarks,
        status: "DRAFT",
        entered_by: session.authUserId,
      })
      .select()
      .single();
    if (error || !data) throw new Error(error?.message || "Failed to create result.");
    result = data;
  }

  const { error: scoresError } = await supabase.from("result_subject_scores").insert(
    computedSubjects.map((s) => ({
      result_id: result.id,
      subject_id: s.subjectId,
      ca: s.ca,
      exam: s.exam,
      total: s.total,
      grade: s.grade,
    }))
  );
  if (scoresError) throw new Error(scoresError.message);

  await recordAuditEntry({
    schoolId: session.profile.school_id,
    userId: session.authUserId,
    action: "RESULT_EDITED",
    entityType: "Result",
    entityId: result.id,
  });

  return result;
}

export async function submitResult(session: CurrentSession, resultId: string): Promise<ResultRow> {
  const supabase = createAdminClient();
  const { data: result } = await supabase.from("results").select("*").eq("id", resultId).single();

  if (!result || result.school_id !== session.profile.school_id) {
    throw new NotFoundError("Result not found.");
  }
  if (result.status !== "DRAFT") {
    throw new ConflictError("Only draft results can be submitted for approval.");
  }

  const { count } = await supabase
    .from("result_subject_scores")
    .select("*", { count: "exact", head: true })
    .eq("result_id", resultId);
  if (!count) {
    throw new ValidationError("Add at least one subject score before submitting.");
  }

  const { data: updated, error } = await supabase
    .from("results")
    .update({
      status: "PENDING_APPROVAL",
      submitted_by: session.authUserId,
      submitted_at: new Date().toISOString(),
      rejection_reason: null,
    })
    .eq("id", resultId)
    .select()
    .single();
  if (error || !updated) throw new Error(error?.message || "Failed to submit result.");

  await recordAuditEntry({
    schoolId: session.profile.school_id,
    userId: session.authUserId,
    action: "RESULT_SUBMITTED",
    entityType: "Result",
    entityId: resultId,
  });

  return updated;
}

export async function decideResultApproval(
  session: CurrentSession,
  input: ResultApprovalInput
): Promise<ResultRow> {
  if (!canApproveResults(session.profile.role)) {
    throw new AuthorizationError("You are not authorized to approve or reject results.");
  }

  const supabase = createAdminClient();
  const { data: result } = await supabase.from("results").select("*").eq("id", input.resultId).single();

  if (!result || result.school_id !== session.profile.school_id) {
    throw new NotFoundError("Result not found.");
  }
  if (result.status !== "PENDING_APPROVAL") {
    throw new ConflictError("Only results awaiting approval can be approved or rejected.");
  }

  let updated: ResultRow;

  if (input.action === "APPROVE") {
    const { data, error } = await supabase
      .from("results")
      .update({
        status: "APPROVED",
        approved_by: session.authUserId,
        approved_at: new Date().toISOString(),
        principal_remarks: input.principalRemarks,
      })
      .eq("id", result.id)
      .select()
      .single();
    if (error || !data) throw new Error(error?.message || "Failed to approve result.");
    updated = data;

    await recordAuditEntry({
      schoolId: session.profile.school_id,
      userId: session.authUserId,
      action: "RESULT_APPROVED",
      entityType: "Result",
      entityId: result.id,
    });

    await notifyResultOwner(updated, "RESULT_APPROVED", "Your submitted result has been approved.");
  } else {
    const rejectionReason = input.rejectionReason || "No reason provided.";
    const { data, error } = await supabase
      .from("results")
      .update({
        status: "DRAFT",
        rejection_reason: rejectionReason,
        submitted_by: null,
        submitted_at: null,
      })
      .eq("id", result.id)
      .select()
      .single();
    if (error || !data) throw new Error(error?.message || "Failed to reject result.");
    updated = data;

    await recordAuditEntry({
      schoolId: session.profile.school_id,
      userId: session.authUserId,
      action: "RESULT_EDITED",
      entityType: "Result",
      entityId: result.id,
      metadata: { reason: "rejected", rejectionReason },
    });

    await notifyResultOwner(
      updated,
      "OTHER",
      `Your submitted result was sent back for correction: ${rejectionReason}`
    );
  }

  return updated;
}

async function notifyResultOwner(
  result: ResultRow,
  type: "RESULT_APPROVED" | "OTHER",
  message: string
): Promise<void> {
  await sendNotification({
    schoolId: result.school_id,
    recipientId: result.entered_by,
    title: type === "RESULT_APPROVED" ? "Result approved" : "Result needs correction",
    message,
    type,
    channel: "IN_APP",
    relatedEntity: { entityType: "Result", entityId: result.id },
  });
}

/**
 * Publishes a single approved result: assigns a QR verification code and
 * notifies the student and any linked parents.
 */
export async function publishResult(session: CurrentSession, resultId: string): Promise<ResultRow> {
  if (!["ADMIN", "PRINCIPAL", "VICE_PRINCIPAL"].includes(session.profile.role)) {
    throw new AuthorizationError("You are not authorized to publish results.");
  }

  const supabase = createAdminClient();
  const { data: result } = await supabase.from("results").select("*").eq("id", resultId).single();

  if (!result || result.school_id !== session.profile.school_id) {
    throw new NotFoundError("Result not found.");
  }
  if (result.status !== "APPROVED") {
    throw new ConflictError("Only approved results can be published.");
  }

  const { data: updated, error } = await supabase
    .from("results")
    .update({
      status: "PUBLISHED",
      published_by: session.authUserId,
      published_at: new Date().toISOString(),
      qr_verification_code: generateVerificationCode(),
    })
    .eq("id", resultId)
    .select()
    .single();
  if (error || !updated) throw new Error(error?.message || "Failed to publish result.");

  await recordAuditEntry({
    schoolId: session.profile.school_id,
    userId: session.authUserId,
    action: "RESULT_PUBLISHED",
    entityType: "Result",
    entityId: resultId,
  });

  await notifyStudentAndParents(updated);

  return updated;
}

/** Recomputes class positions for every approved/published result in a class+session+term. */
export async function recalculateClassPositions(
  schoolId: string,
  classId: string,
  academicSessionId: string,
  termId: string
): Promise<void> {
  const supabase = createAdminClient();
  const { data: results } = await supabase
    .from("results")
    .select("id, overall_total")
    .eq("school_id", schoolId)
    .eq("class_id", classId)
    .eq("academic_session_id", academicSessionId)
    .eq("term_id", termId)
    .in("status", ["APPROVED", "PUBLISHED"]);

  if (!results || results.length === 0) return;

  const positions = computeClassPositions(
    results.map((r) => ({ resultId: r.id, overallTotal: r.overall_total || 0 }))
  );

  await Promise.all(
    Object.entries(positions).map(([resultId, position]) =>
      supabase.from("results").update({ overall_position: position }).eq("id", resultId)
    )
  );
}

export async function hideResult(session: CurrentSession, resultId: string): Promise<ResultRow> {
  if (session.profile.role !== "ADMIN") {
    throw new AuthorizationError("Only administrators can hide a published result.");
  }
  const supabase = createAdminClient();
  const { data: result } = await supabase.from("results").select("*").eq("id", resultId).single();

  if (!result || result.school_id !== session.profile.school_id) {
    throw new NotFoundError("Result not found.");
  }
  if (result.status !== "PUBLISHED") {
    throw new ConflictError("Only published results can be hidden.");
  }

  const { data: updated, error } = await supabase
    .from("results")
    .update({
      status: "HIDDEN",
      hidden_by: session.authUserId,
      hidden_at: new Date().toISOString(),
    })
    .eq("id", resultId)
    .select()
    .single();
  if (error || !updated) throw new Error(error?.message || "Failed to hide result.");

  await recordAuditEntry({
    schoolId: session.profile.school_id,
    userId: session.authUserId,
    action: "RESULT_HIDDEN",
    entityType: "Result",
    entityId: resultId,
  });

  return updated;
}

async function notifyStudentAndParents(result: ResultRow): Promise<void> {
  const supabase = createAdminClient();
  const { data: student } = await supabase
    .from("students")
    .select("id, full_name, user_id")
    .eq("id", result.student_id)
    .single();
  if (!student) return;

  const recipients: string[] = [];
  if (student.user_id) recipients.push(student.user_id);

  const { data: parentLinks } = await supabase
    .from("parent_students")
    .select("parent_id")
    .eq("student_id", student.id);

  if (parentLinks && parentLinks.length > 0) {
    const { data: parents } = await supabase
      .from("parents")
      .select("user_id")
      .in(
        "id",
        parentLinks.map((p) => p.parent_id)
      );
    for (const parent of parents ?? []) recipients.push(parent.user_id);
  }

  await Promise.all(
    recipients.map((recipientId) =>
      sendNotification({
        schoolId: result.school_id,
        recipientId,
        title: "Result published",
        message: `${student.full_name}'s result has been published and is now available to view.`,
        type: "RESULT_PUBLISHED",
        channel: "IN_APP",
        relatedEntity: { entityType: "Result", entityId: result.id },
      })
    )
  );
}
