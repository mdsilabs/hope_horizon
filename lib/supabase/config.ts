/**
 * Hope Horizon's PUBLIC Supabase project identity.
 * Public publishable keys are designed to be embedded in client apps.
 * Never add secret, service-role, JWT-signing or database credentials here.
 */
export const SUPABASE_PROJECT_NAME = "supabase-cyclamen-park";
export const SUPABASE_PROJECT_REF = "iwfpdwihinhcwjgvmfei";
export const SUPABASE_PROJECT_URL = "https://iwfpdwihinhcwjgvmfei.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_QLi8sSbByVHa9luUvJFLeA_1ouCrR7Q";

/**
 * Every client, including server-only admin code, uses the same project URL.
 * Reject a different project configured in Vercel rather than sending user
 * records to the wrong Supabase instance.
 */
export function getPublicSupabaseConfig() {
  const suppliedUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || SUPABASE_PROJECT_URL;
  let parsed: URL;
  try {
    parsed = new URL(suppliedUrl);
  } catch {
    throw new Error("Invalid NEXT_PUBLIC_SUPABASE_URL.");
  }
  if (parsed.origin !== SUPABASE_PROJECT_URL || parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new Error("Supabase project mismatch. Hope Horizon must use the configured project reference.");
  }
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() || SUPABASE_PUBLISHABLE_KEY;
  if (!key.startsWith("sb_publishable_")) {
    throw new Error("Invalid Supabase publishable key. Use NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.");
  }
  return { url: SUPABASE_PROJECT_URL, key };
}
