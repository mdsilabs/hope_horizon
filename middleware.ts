import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/types/database";
import { canAccessSegment } from "@/lib/auth/rbac";
import { getPublicSupabaseConfig } from "@/lib/supabase/config";

const PROTECTED_SEGMENTS = [
  "admin", "teacher", "student", "parent", "principal", "vice-principal", "accountant", "profile", "reports", "change-password",
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
  // Static resources never require database or authorization checks.
  if(pathname.startsWith("/_next/")||pathname.startsWith("/favicon")||
    pathname.startsWith("/images/"))return NextResponse.next();

  let supabaseUrl: string;
  let supabaseAnonKey: string;
  try {
    const publicConfig = getPublicSupabaseConfig();
    supabaseUrl = publicConfig.url;
    supabaseAnonKey = publicConfig.key;
  } catch (error) {
    console.error("Routing middleware Supabase project configuration error:", error);
    if(isPublic)return NextResponse.next();
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

    // This is a read-only, public singleton. For installation upgrades,
    // missing-table errors are tolerated until migration 0018 is applied.
    const {data:maintenance,error:maintenanceError}=await supabase
      .from("platform_installation_controls").select("paused,notice").eq("id",1).maybeSingle();
    const missingControl=maintenanceError &&
      (["PGRST205","PGRST116","42P01"].includes(maintenanceError.code)||
       /could not find the table/i.test(maintenanceError.message));
    if(maintenanceError&&!missingControl){
      console.error("Maintenance control lookup failed",maintenanceError.code);
      return new NextResponse("School portal availability cannot be verified.",{status:503});
    }
    if(maintenance?.paused){
      const isMaintenanceEntry=pathname==="/system-paused"||
        pathname==="/admin/platform-control"||
        pathname.startsWith("/api/admin/platform-control")||
        pathname==="/login"||pathname==="/forgot-password"||
        pathname==="/reset-password"||pathname==="/change-password"||
        pathname.startsWith("/api/auth")||pathname==="/favicon.ico";
      if(!isMaintenanceEntry){
        if(pathname.startsWith("/api/")){
          return NextResponse.json({error:{message:maintenance.notice||"Portal paused for maintenance."}},
            {status:503,headers:{"Cache-Control":"no-store"}});
        }
        return NextResponse.redirect(new URL("/system-paused",request.url));
      }
    }
    if(!isProtectedSegment||isPublic)return response;

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return loginRedirect(request, pathname);

    const { data: profile, error: profileError } = await supabase
      .from("users").select("role, is_active, must_change_password").eq("id", user.id).single();
    if (profileError || !profile || !profile.is_active || (firstSegment !== "profile" && firstSegment !== "reports" && firstSegment !== "change-password" && !canAccessSegment(profile.role, firstSegment))) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    if(profile.must_change_password && firstSegment!=="change-password"){
      return NextResponse.redirect(new URL("/change-password",request.url));
    }
    if(!profile.must_change_password && firstSegment==="change-password"){
      return NextResponse.redirect(new URL("/",request.url));
    }
    return response;
  } catch (error) {
    console.error("Routing middleware auth check failed:", error);
    return loginRedirect(request, pathname, "auth");
  }
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
