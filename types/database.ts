/**
 * Hand-written types mirroring supabase/migrations/*.sql.
 *
 * Once a live Supabase project exists, regenerate this file from the
 * source of truth with:
 *   supabase gen types typescript --project-id <ref> > types/database.ts
 * and keep the `Enums` re-exports below (types/enums.ts imports from here).
 */

export type UserRole =
  | "ADMIN"
  | "TEACHER"
  | "STUDENT"
  | "PARENT"
  | "PRINCIPAL"
  | "VICE_PRINCIPAL"
  | "ACCOUNTANT"
  | "OTHER";

export type SchoolLevel = "PRIMARY" | "SECONDARY" | "COLLEGE" | "UNIVERSITY" | "OTHER";
export type AcademicStructureType = "TERM" | "SEMESTER" | "OTHER";
export type ResultStatus = "DRAFT" | "SUBMITTED" | "PENDING_APPROVAL" | "APPROVED" | "PUBLISHED" | "HIDDEN";
/** Only these three — do not add SMS or NONE. See docs/BLUEPRINT.md §7. */
export type NotificationChannel = "EMAIL" | "WHATSAPP" | "IN_APP";
export type NotificationStatus = "PENDING" | "SENT" | "FAILED" | "READ";
export type NotificationType =
  | "RESULT_PUBLISHED"
  | "RESULT_APPROVED"
  | "RESULT_SUBMITTED_FOR_APPROVAL"
  | "RESULT_HIDDEN"
  | "ACCOUNT_CREATED"
  | "PASSWORD_RESET"
  | "SYSTEM_ANNOUNCEMENT"
  | "OTHER";
export type AuditAction =
  | "LOGIN"
  | "LOGOUT"
  | "LOGIN_FAILED"
  | "RESULT_CREATED"
  | "RESULT_EDITED"
  | "RESULT_SUBMITTED"
  | "RESULT_APPROVED"
  | "RESULT_PUBLISHED"
  | "RESULT_HIDDEN"
  | "RESULT_DELETED"
  | "STUDENT_CREATED"
  | "STUDENT_UPDATED"
  | "STUDENT_DELETED"
  | "TEACHER_CREATED"
  | "TEACHER_UPDATED"
  | "TEACHER_DELETED"
  | "USER_ROLE_CHANGED"
  | "PASSWORD_RESET_REQUESTED"
  | "PASSWORD_RESET_COMPLETED"
  | "SYSTEM_SETTING_CHANGED"
  | "BULK_RESULT_UPLOAD";

export interface GradeBand {
  minScore: number;
  maxScore: number;
  grade: string;
  remark?: string;
}

export interface Database {
  public: {
    Tables: {
      schools: {
        Row: {
          id: string;
          name: string;
          levels: SchoolLevel[];
          logo_url: string | null;
          contact_email: string | null;
          contact_phone: string | null;
          address: string | null;
          website: string | null;
          academic_structure_type: AcademicStructureType;
          academic_period_label: string;
          periods_per_session: number;
          current_academic_session_id: string | null;
          current_term_id: string | null;
          grading_scale: GradeBand[];
          ca_max_score: number;
          exam_max_score: number;
          show_position_on_result: boolean;
          show_average_on_result: boolean;
          require_approval_before_publish: boolean;
          enable_qr_verification: boolean;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["schools"]["Row"]> & { name: string };
        Update: Partial<Database["public"]["Tables"]["schools"]["Row"]>;
        Relationships: [
          { foreignKeyName: "schools_current_session_fk"; columns: ["current_academic_session_id"]; referencedRelation: "academic_sessions"; referencedColumns: ["id"] },
          { foreignKeyName: "schools_current_term_fk"; columns: ["current_term_id"]; referencedRelation: "terms"; referencedColumns: ["id"] },
        ];
      };
      users: {
        Row: {
          id: string;
          school_id: string;
          name: string;
          email: string;
          phone: string | null;
          whatsapp_number: string | null;
          role: UserRole;
          is_active: boolean;
          last_login_at: string | null;
          must_change_password: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["users"]["Row"]> & {
          id: string;
          school_id: string;
          name: string;
          email: string;
          role: UserRole;
        };
        Update: Partial<Database["public"]["Tables"]["users"]["Row"]>;
        Relationships: [
          { foreignKeyName: "users_school_id_fkey"; columns: ["school_id"]; referencedRelation: "schools"; referencedColumns: ["id"] },
        ];
      };
      academic_sessions: {
        Row: {
          id: string;
          school_id: string;
          name: string;
          start_date: string;
          end_date: string;
          is_current: boolean;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["academic_sessions"]["Row"]> & {
          school_id: string;
          name: string;
          start_date: string;
          end_date: string;
        };
        Update: Partial<Database["public"]["Tables"]["academic_sessions"]["Row"]>;
        Relationships: [
          { foreignKeyName: "academic_sessions_school_id_fkey"; columns: ["school_id"]; referencedRelation: "schools"; referencedColumns: ["id"] },
        ];
      };
      terms: {
        Row: {
          id: string;
          school_id: string;
          academic_session_id: string;
          name: string;
          structure_type: AcademicStructureType;
          order: number;
          start_date: string;
          end_date: string;
          is_current: boolean;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["terms"]["Row"]> & {
          school_id: string;
          academic_session_id: string;
          name: string;
          order: number;
          start_date: string;
          end_date: string;
        };
        Update: Partial<Database["public"]["Tables"]["terms"]["Row"]>;
        Relationships: [
          { foreignKeyName: "terms_school_id_fkey"; columns: ["school_id"]; referencedRelation: "schools"; referencedColumns: ["id"] },
          { foreignKeyName: "terms_academic_session_id_fkey"; columns: ["academic_session_id"]; referencedRelation: "academic_sessions"; referencedColumns: ["id"] },
        ];
      };
      classes: {
        Row: {
          id: string;
          school_id: string;
          name: string;
          level: SchoolLevel;
          arm: string | null;
          class_teacher_id: string | null;
          order: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["classes"]["Row"]> & {
          school_id: string;
          name: string;
          level: SchoolLevel;
        };
        Update: Partial<Database["public"]["Tables"]["classes"]["Row"]>;
        Relationships: [
          { foreignKeyName: "classes_school_id_fkey"; columns: ["school_id"]; referencedRelation: "schools"; referencedColumns: ["id"] },
          { foreignKeyName: "classes_class_teacher_fk"; columns: ["class_teacher_id"]; referencedRelation: "teachers"; referencedColumns: ["id"] },
        ];
      };
      subjects: {
        Row: {
          id: string;
          school_id: string;
          name: string;
          code: string;
          description: string | null;
          ca_max_score_override: number | null;
          exam_max_score_override: number | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["subjects"]["Row"]> & {
          school_id: string;
          name: string;
          code: string;
        };
        Update: Partial<Database["public"]["Tables"]["subjects"]["Row"]>;
        Relationships: [
          { foreignKeyName: "subjects_school_id_fkey"; columns: ["school_id"]; referencedRelation: "schools"; referencedColumns: ["id"] },
        ];
      };
      class_subjects: {
        Row: { class_id: string; subject_id: string };
        Insert: { class_id: string; subject_id: string };
        Update: Partial<{ class_id: string; subject_id: string }>;
        Relationships: [
          { foreignKeyName: "class_subjects_class_id_fkey"; columns: ["class_id"]; referencedRelation: "classes"; referencedColumns: ["id"] },
          { foreignKeyName: "class_subjects_subject_id_fkey"; columns: ["subject_id"]; referencedRelation: "subjects"; referencedColumns: ["id"] },
        ];
      };
      teachers: {
        Row: {
          id: string;
          user_id: string;
          school_id: string;
          full_name: string;
          staff_id: string;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["teachers"]["Row"]> & {
          user_id: string;
          school_id: string;
          full_name: string;
          staff_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["teachers"]["Row"]>;
        Relationships: [
          { foreignKeyName: "teachers_user_id_fkey"; columns: ["user_id"]; referencedRelation: "users"; referencedColumns: ["id"] },
          { foreignKeyName: "teachers_school_id_fkey"; columns: ["school_id"]; referencedRelation: "schools"; referencedColumns: ["id"] },
        ];
      };
      teacher_classes: {
        Row: { teacher_id: string; class_id: string };
        Insert: { teacher_id: string; class_id: string };
        Update: Partial<{ teacher_id: string; class_id: string }>;
        Relationships: [
          { foreignKeyName: "teacher_classes_teacher_id_fkey"; columns: ["teacher_id"]; referencedRelation: "teachers"; referencedColumns: ["id"] },
          { foreignKeyName: "teacher_classes_class_id_fkey"; columns: ["class_id"]; referencedRelation: "classes"; referencedColumns: ["id"] },
        ];
      };
      teacher_subject_assignments: {
        Row: { teacher_id: string; class_id: string; subject_id: string };
        Insert: { teacher_id: string; class_id: string; subject_id: string };
        Update: Partial<{ teacher_id: string; class_id: string; subject_id: string }>;
        Relationships: [
          { foreignKeyName: "teacher_subject_assignments_teacher_id_fkey"; columns: ["teacher_id"]; referencedRelation: "teachers"; referencedColumns: ["id"] },
          { foreignKeyName: "teacher_subject_assignments_class_id_fkey"; columns: ["class_id"]; referencedRelation: "classes"; referencedColumns: ["id"] },
          { foreignKeyName: "teacher_subject_assignments_subject_id_fkey"; columns: ["subject_id"]; referencedRelation: "subjects"; referencedColumns: ["id"] },
        ];
      };
      students: {
        Row: {
          id: string;
          user_id: string | null;
          school_id: string;
          full_name: string;
          passport_url: string | null;
          registration_number: string | null;
          admission_number: string;
          student_id: string | null;
          class_id: string;
          gender: "MALE" | "FEMALE" | "OTHER" | null;
          date_of_birth: string | null;
          current_academic_session_id: string | null;
          scratch_card_pin_hash: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["students"]["Row"]> & {
          school_id: string;
          full_name: string;
          admission_number: string;
          class_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["students"]["Row"]>;
        Relationships: [
          { foreignKeyName: "students_user_id_fkey"; columns: ["user_id"]; referencedRelation: "users"; referencedColumns: ["id"] },
          { foreignKeyName: "students_school_id_fkey"; columns: ["school_id"]; referencedRelation: "schools"; referencedColumns: ["id"] },
          { foreignKeyName: "students_class_id_fkey"; columns: ["class_id"]; referencedRelation: "classes"; referencedColumns: ["id"] },
          { foreignKeyName: "students_current_academic_session_id_fkey"; columns: ["current_academic_session_id"]; referencedRelation: "academic_sessions"; referencedColumns: ["id"] },
        ];
      };
      parents: {
        Row: {
          id: string;
          user_id: string;
          school_id: string;
          full_name: string;
          phone: string | null;
          whatsapp_number: string | null;
          email: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["parents"]["Row"]> & {
          user_id: string;
          school_id: string;
          full_name: string;
        };
        Update: Partial<Database["public"]["Tables"]["parents"]["Row"]>;
        Relationships: [
          { foreignKeyName: "parents_user_id_fkey"; columns: ["user_id"]; referencedRelation: "users"; referencedColumns: ["id"] },
          { foreignKeyName: "parents_school_id_fkey"; columns: ["school_id"]; referencedRelation: "schools"; referencedColumns: ["id"] },
        ];
      };
      parent_students: {
        Row: { parent_id: string; student_id: string };
        Insert: { parent_id: string; student_id: string };
        Update: Partial<{ parent_id: string; student_id: string }>;
        Relationships: [
          { foreignKeyName: "parent_students_parent_id_fkey"; columns: ["parent_id"]; referencedRelation: "parents"; referencedColumns: ["id"] },
          { foreignKeyName: "parent_students_student_id_fkey"; columns: ["student_id"]; referencedRelation: "students"; referencedColumns: ["id"] },
        ];
      };
      results: {
        Row: {
          id: string;
          school_id: string;
          student_id: string;
          class_id: string;
          academic_session_id: string;
          term_id: string;
          overall_total: number | null;
          overall_average: number | null;
          overall_position: number | null;
          attendance_present: number | null;
          attendance_absent: number | null;
          attendance_total_days: number | null;
          teacher_remarks: string | null;
          principal_remarks: string | null;
          status: ResultStatus;
          entered_by: string;
          submitted_by: string | null;
          submitted_at: string | null;
          approved_by: string | null;
          approved_at: string | null;
          published_by: string | null;
          published_at: string | null;
          hidden_by: string | null;
          hidden_at: string | null;
          rejection_reason: string | null;
          qr_verification_code: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["results"]["Row"]> & {
          school_id: string;
          student_id: string;
          class_id: string;
          academic_session_id: string;
          term_id: string;
          entered_by: string;
        };
        Update: Partial<Database["public"]["Tables"]["results"]["Row"]>;
        Relationships: [
          { foreignKeyName: "results_school_id_fkey"; columns: ["school_id"]; referencedRelation: "schools"; referencedColumns: ["id"] },
          { foreignKeyName: "results_student_id_fkey"; columns: ["student_id"]; referencedRelation: "students"; referencedColumns: ["id"] },
          { foreignKeyName: "results_class_id_fkey"; columns: ["class_id"]; referencedRelation: "classes"; referencedColumns: ["id"] },
          { foreignKeyName: "results_academic_session_id_fkey"; columns: ["academic_session_id"]; referencedRelation: "academic_sessions"; referencedColumns: ["id"] },
          { foreignKeyName: "results_term_id_fkey"; columns: ["term_id"]; referencedRelation: "terms"; referencedColumns: ["id"] },
          { foreignKeyName: "results_entered_by_fkey"; columns: ["entered_by"]; referencedRelation: "users"; referencedColumns: ["id"] },
          { foreignKeyName: "results_submitted_by_fkey"; columns: ["submitted_by"]; referencedRelation: "users"; referencedColumns: ["id"] },
          { foreignKeyName: "results_approved_by_fkey"; columns: ["approved_by"]; referencedRelation: "users"; referencedColumns: ["id"] },
          { foreignKeyName: "results_published_by_fkey"; columns: ["published_by"]; referencedRelation: "users"; referencedColumns: ["id"] },
          { foreignKeyName: "results_hidden_by_fkey"; columns: ["hidden_by"]; referencedRelation: "users"; referencedColumns: ["id"] },
        ];
      };
      result_subject_scores: {
        Row: {
          id: string;
          result_id: string;
          subject_id: string;
          ca: number;
          exam: number;
          total: number;
          grade: string | null;
          remark: string | null;
          subject_position: number | null;
        };
        Insert: Partial<Database["public"]["Tables"]["result_subject_scores"]["Row"]> & {
          result_id: string;
          subject_id: string;
          ca: number;
          exam: number;
          total: number;
        };
        Update: Partial<Database["public"]["Tables"]["result_subject_scores"]["Row"]>;
        Relationships: [
          { foreignKeyName: "result_subject_scores_result_id_fkey"; columns: ["result_id"]; referencedRelation: "results"; referencedColumns: ["id"] },
          { foreignKeyName: "result_subject_scores_subject_id_fkey"; columns: ["subject_id"]; referencedRelation: "subjects"; referencedColumns: ["id"] },
        ];
      };
      notifications: {
        Row: {
          id: string;
          school_id: string;
          recipient_id: string;
          title: string;
          message: string;
          type: NotificationType;
          channel: NotificationChannel;
          status: NotificationStatus;
          read_at: string | null;
          related_entity_type: string | null;
          related_entity_id: string | null;
          failure_reason: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["notifications"]["Row"]> & {
          school_id: string;
          recipient_id: string;
          title: string;
          message: string;
          channel: NotificationChannel;
        };
        Update: Partial<Database["public"]["Tables"]["notifications"]["Row"]>;
        Relationships: [
          { foreignKeyName: "notifications_school_id_fkey"; columns: ["school_id"]; referencedRelation: "schools"; referencedColumns: ["id"] },
          { foreignKeyName: "notifications_recipient_id_fkey"; columns: ["recipient_id"]; referencedRelation: "users"; referencedColumns: ["id"] },
        ];
      };
      audit_logs: {
        Row: {
          id: string;
          school_id: string;
          user_id: string | null;
          action: AuditAction;
          entity_type: string | null;
          entity_id: string | null;
          metadata: Record<string, unknown> | null;
          ip_address: string | null;
          user_agent: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["audit_logs"]["Row"]> & {
          school_id: string;
          action: AuditAction;
        };
        Update: Partial<Database["public"]["Tables"]["audit_logs"]["Row"]>;
        Relationships: [
          { foreignKeyName: "audit_logs_school_id_fkey"; columns: ["school_id"]; referencedRelation: "schools"; referencedColumns: ["id"] },
          { foreignKeyName: "audit_logs_user_id_fkey"; columns: ["user_id"]; referencedRelation: "users"; referencedColumns: ["id"] },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
}
