/**
 * Supabase Auth redirect target for password setup and recovery.
 *
 * An unconfigured or localhost URL on a production build must never produce
 * a usable mail link. Supabase's Site URL and redirect allowlist must ALSO
 * be configured in its Auth dashboard.
 */
export function resolveRecoveryRedirectUrl(
  appOrigin: string | undefined,
  runtime: string | undefined,
): string | null {
  if (!appOrigin) return null;
  try {
    const url = new URL(appOrigin.trim());
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if ((url.protocol !== "https:" && !(local && url.protocol === "http:")) ||
      (runtime === "production" && local) ||
      url.username || url.password ||
      url.pathname !== "/" || url.search || url.hash) {
      return null;
    }
    return new URL("/reset-password", url).toString();
  } catch {
    return null;
  }
}
