import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "nexo_session";
const PUBLIC_PATHS = ["/login", "/api/auth/login"];

/**
 * First barrier only: no session cookie, no private page or API. The cookie's
 * signature and the user's role are verified on the server for every request
 * (see app/_server/auth.ts); the proxy is deliberately not the security
 * boundary, just a fast redirect.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = request.cookies.has(SESSION_COOKIE);
  const isPublic = PUBLIC_PATHS.includes(pathname);

  if (!hasSession && !isPublic) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { code: "UNAUTHENTICATED", message: "Faça login para continuar." },
        { status: 401 },
      );
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
