import "server-only";
import { randomBytes } from "node:crypto";
import { AppError } from "@/lib/utils/errors";
import { createClient } from "@/lib/supabase/server";
import type { createAdminClient } from "@/lib/supabase/admin";

/** A cryptographically random, single-display credential with >140 bits of entropy. */
export function generateTemporaryPassword() {
  return randomBytes(18).toString("base64url") + "Aa1!";
}
export function generateUnusedPassword() {
  return randomBytes(42).toString("base64url") + "Aa1!";
}

export function getApprovedRecoveryUrl(): string | null {
  const origin = process.env.NEXT_PUBLIC_APP_URL;
  if (!origin) return null;
  try {
    const url = new URL(origin);
    if (!((url.protocol==="https:" && url.hostname) ||
      (url.protocol==="http:" && url.hostname==="localhost"))) return null;
    if (url.username || url.password || url.search || url.hash || url.pathname!=="/") return null;
    return new URL("/reset-password",url).toString();
  } catch { return null; }
}

/** Fails closed when the hardened auth trigger or guard is not installed. */
export async function requireProvisioningSecurity() {
  const db = await createClient();
  const {data,error}=await db.rpc("hh_portal_capabilities");
  if (error || !data?.auth_trigger || !data?.authorization_guard) {
    throw new AppError("Install Supabase migrations 0004 and 0005 before provisioning accounts.",503,"MIGRATION_REQUIRED");
  }
}

export async function requestSetupEmail(
  admin: ReturnType<typeof createAdminClient>, email: string
): Promise<"requested"|"not_sent"> {
  const redirectTo = getApprovedRecoveryUrl();
  if (!redirectTo) return "not_sent";
  const {error} = await admin.auth.resetPasswordForEmail(email,{redirectTo});
  if (error) {
    console.error("Supabase Auth setup-email request rejected (check email provider/redirect settings).");
    return "not_sent";
  }
  return "requested";
}
