import { type NextRequest, NextResponse } from "next/server";
import { verifyCustomerToken, CUSTOMER_COOKIE_NAME } from "@/lib/auth/cookie-sign";

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

  if (pathname.startsWith("/_next")) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api")) {
    if (!isCsrfSafe(request)) {
      return NextResponse.json({ error: "CSRF validation failed" }, { status: 403 });
    }
    return NextResponse.next();
  }

  if (pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/admin/login";
    return NextResponse.redirect(url);
  }

  // Customer routes
  if (pathname.startsWith("/customer")) {
    if (pathname === "/customer/login") {
      return NextResponse.next();
    }
    const token = request.cookies.get(CUSTOMER_COOKIE_NAME)?.value;
    if (!token) {
      const url = request.nextUrl.clone();
      url.pathname = "/customer/login";
      return NextResponse.redirect(url);
    }
    const payload = await verifyCustomerToken(token);
    if (!payload) {
      const url = request.nextUrl.clone();
      url.pathname = "/customer/login";
      url.searchParams.set("reason", "invalid_session");
      return NextResponse.redirect(url);
    }
    if (!payload.is_active) {
      const url = request.nextUrl.clone();
      url.pathname = "/customer/login";
      url.searchParams.set("reason", "blocked");
      return NextResponse.redirect(url);
    }
    if (new Date(payload.subscription_end) <= new Date()) {
      const url = request.nextUrl.clone();
      url.pathname = "/customer/login";
      url.searchParams.set("reason", "expired");
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  // Admin routes — auth handled by auth provider
  if (pathname.startsWith("/admin")) {
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
