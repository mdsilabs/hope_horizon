/** Safe, actionable Co-Admin provisioning errors. Never expose credentials or raw Auth logs. */
export type AuthProvisioningFailure = { code?: string; status?: number; message?: string };
export type ProvisioningDiagnosis = {
  message: string;
  status: number;
  code: "ACCOUNT_EXISTS" | "AUTH_CONFIGURATION_ERROR" | "AUTH_DATABASE_ERROR" | "INVALID_EMAIL" | "AUTH_PROVISIONING_FAILED";
};

export function diagnoseCoAdminCreateFailure(
  error: AuthProvisioningFailure | null | undefined
): ProvisioningDiagnosis {
  const code = error?.code?.toLowerCase() || "";
  const message = error?.message?.toLowerCase() || "";
  if (code === "email_exists" || code === "user_already_exists" ||
      message.includes("already been registered") || message.includes("already registered") ||
      message.includes("already exists")) {
    return {
      code: "ACCOUNT_EXISTS",
      status: 409,
      message: "This email already has a Supabase Auth account. Use a different address or recover the existing account; it cannot be registered twice.",
    };
  }
  if (code === "email_address_invalid" || message.includes("invalid email")) {
    return {
      code: "INVALID_EMAIL", status: 422,
      message: "Supabase Auth rejected this email address. Enter a valid, permitted email and try again.",
    };
  }
  if (error?.status === 401 || error?.status === 403 ||
      code === "insufficient_permissions" || message.includes("invalid api key") ||
      message.includes("invalid jwt")) {
    return {
      code: "AUTH_CONFIGURATION_ERROR", status: 503,
      message: "Supabase Auth administration is unavailable. Check the server-only SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY for the correct project.",
    };
  }
  if (code === "database_error_saving_new_user" ||
      code === "database_error_creating_new_user" ||
      message.includes("database error saving new user") ||
      message.includes("database error creating new user")) {
    return {
      code: "AUTH_DATABASE_ERROR", status: 503,
      message: "Supabase could not save the account in its database. Inspect the matching Postgres error in Supabase Logs to identify the failed trigger, constraint or permission. Do not rerun migrations without checking the cause.",
    };
  }
  return {
    code: "AUTH_PROVISIONING_FAILED", status: 502,
    message: "Supabase Auth could not create this Co-Admin. Check Supabase Authentication logs, project credentials and account-provisioning migrations.",
  };
}

/**
 * Keep provider diagnostic messages on the server, but redact the most
 * common credential and account identifiers before logging.
 * Never return this text to the client or persist it in audit records.
 */
export function sanitizeAuthErrorForServerLog(input: unknown): string {
  if (typeof input !== "string") return "No provider message";
  return input
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\b(?:sb_(?:secret|publishable)_[a-zA-Z0-9_-]+|eyJ[a-zA-Z0-9._-]{20,})\b/g, "[credential]")
    .replace(/https?:\/\/\S+/gi, "[url]")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, "[uuid]")
    .slice(0, 350);
}
