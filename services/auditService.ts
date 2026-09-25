import { createAdminClient } from "@/lib/supabase/admin";
import type { AuditAction } from "@/types/database";

interface RecordAuditEntryInput {
  schoolId: string;
  userId?: string;
  action: AuditAction;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  request?: Request;
}

/**
 * Records a single audit trail entry. Uses the admin (service-role)
 * client deliberately: audit_logs has an insert-only RLS policy for
 * regular users, but we want writes here to never fail due to an RLS
 * edge case, since a missed audit entry is worse than a slightly
 * privileged write path. Never pass passwords, tokens, or other secrets
 * in `metadata` — see supabase/migrations/0001_init.sql.
 */
export async function recordAuditEntry({
  schoolId,
  userId,
  action,
  entityType,
  entityId,
  metadata,
  request,
}: RecordAuditEntryInput): Promise<void> {
  const supabase = createAdminClient();
  await supabase.from("audit_logs").insert({
    school_id: schoolId,
    user_id: userId,
    action,
    entity_type: entityType,
    entity_id: entityId,
    metadata,
    ip_address: request?.headers.get("x-forwarded-for") ?? undefined,
    user_agent: request?.headers.get("user-agent") ?? undefined,
  });
}
