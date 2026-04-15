import { NextResponse, type NextRequest } from "next/server";
import { JWT_COOKIE } from "./lib/auth-constants";

/**
 * Lightweight auth gate for page routes. Performs a cheap cookie-presence check
 * (edge runtime can't use `jsonwebtoken`). Full signature verification happens
 * in the server component via `getSession()`.
 */
export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  const isPublic =
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/auth/login") ||
    pathname.startsWith("/public") ||
    pathname.startsWith("/images") ||
    pathname.startsWith("/stylesheets") ||
    pathname === "/sw.js" ||
    pathname === "/favicon.ico";

  if (isPublic) return NextResponse.next();

  // API key-based routes handle their own auth
  if (pathname.startsWith("/api/devices") || pathname.startsWith("/api/set-")) {
    return NextResponse.next();
  }

  const hasJwt = request.cookies.get(JWT_COOKIE)?.value;
  if (!hasJwt) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|images|stylesheets|favicon.ico|sw.js).*)"],
};
