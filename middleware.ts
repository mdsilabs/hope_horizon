import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/types/database";
import { canAccessSegment } from "@/lib/auth/rbac";

const PROTECTED_SEGMENTS = [
  "admin",
  "teacher",
  "student",
  "parent",
  "principal",
  "vice-principal",
  "accountant",
];

const PUBLIC_PATHS = ["/", "/login", "/forgot-password", "/reset-password", "/result-verification"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isPublic =
    PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`)) ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon");

  const firstSegment = pathname.split("/").filter(Boolean)[0];
  const isProtectedSegment = PROTECTED_SEGMENTS.includes(firstSegment);

  // Every response must carry the (possibly refreshed) Supabase auth
  // cookies, so we build `response` up front and let the Supabase client
  // write to it via the cookies adapter below, per @supabase/ssr's
  // documented middleware pattern.
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    }
  );

  // Always call getUser() so Supabase can refresh an expiring session —
  // skipping this on public routes would let sessions silently expire.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!isProtectedSegment || isPublic) {
    return response;
  }

  if (!user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const { data: profile } = await supabase.from("users").select("role").eq("id", user.id).single();

  if (!profile || !canAccessSegment(profile.role, firstSegment)) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
