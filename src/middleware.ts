import { type NextRequest, NextResponse } from "next/server";
import { verifyAuthToken, AUTH_COOKIE_NAME } from "@/lib/auth/cookie-sign";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function isCsrfSafe(request: NextRequest): boolean {
  if (!MUTATING_METHODS.has(request.method)) return true;
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const host = request.headers.get("host");
  if (!host) return false;
  const source = origin ?? referer;
  if (!source) return true;
  try {
    return new URL(source).host === host;
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow static files and internals
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/fonts") ||
    pathname.startsWith("/public") ||
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt"
  ) {
    return NextResponse.next();
  }

  // API CSRF check
  if (pathname.startsWith("/api")) {
    if (!isCsrfSafe(request)) {
      return NextResponse.json({ error: "CSRF validation failed" }, { status: 403 });
    }
    return NextResponse.next();
  }

  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  const payload = token ? await verifyAuthToken(token) : null;
  const isAuthenticated = !!payload;

  // If on login page
  if (pathname === "/login") {
    if (isAuthenticated) {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  // Redirect legacy /admin or /customer routes directly to /
  if (pathname.startsWith("/admin") || pathname.startsWith("/customer")) {
    const url = request.nextUrl.clone();
    url.pathname = isAuthenticated ? "/" : "/login";
    return NextResponse.redirect(url);
  }

  // Protected pages
  if (!isAuthenticated) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
