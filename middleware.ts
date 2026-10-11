import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/types/database";
import { canAccessSegment } from "@/lib/auth/rbac";
import { getPublicSupabaseConfig } from "@/lib/supabase/config";

const PROTECTED_SEGMENTS = [
  "admin", "teacher", "student", "parent", "principal", "vice-principal", "accountant", "profile",
];
const PUBLIC_PATHS = ["/", "/login", "/forgot-password", "/reset-password", "/result-verification"];

function loginRedirect(request: NextRequest, pathname: string, reason?: string) {
  const loginUrl = new URL("/login", request.url);
  if (pathname && pathname !== "/login") loginUrl.searchParams.set("redirectTo", pathname);
  if (reason) loginUrl.searchParams.set("reason", reason);
  return NextResponse.redirect(loginUrl);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) =>
    pathname === p || (p !== "/" && pathname.startsWith(p + "/"))
  ) || pathname.startsWith("/api/auth") || pathname.startsWith("/_next") || pathname.startsWith("/favicon");
  const firstSegment = pathname.split("/").filter(Boolean)[0] ?? "";
  const isProtectedSegment = PROTECTED_SEGMENTS.includes(firstSegment);
  if (!isProtectedSegment || isPublic) return NextResponse.next();

  let supabaseUrl: string;
  let supabaseAnonKey: string;
  try {
    const publicConfig = getPublicSupabaseConfig();
    supabaseUrl = publicConfig.url;
    supabaseAnonKey = publicConfig.key;
  } catch (error) {
    console.error("Routing middleware Supabase project configuration error:", error);
    return loginRedirect(request, pathname, "configuration");
  }

  let response = NextResponse.next({ request });
  try {
    const supabase = createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return loginRedirect(request, pathname);

    const { data: profile, error: profileError } = await supabase
      .from("users").select("role, is_active").eq("id", user.id).single();
    if (profileError || !profile || !profile.is_active || (firstSegment !== "profile" && !canAccessSegment(profile.role, firstSegment))) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return response;
  } catch (error) {
    console.error("Routing middleware auth check failed:", error);
    return loginRedirect(request, pathname, "auth");
  }
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
