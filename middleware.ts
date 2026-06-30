import { NextResponse, type NextRequest } from "next/server";
import {
  SESSION_COOKIE,
  verifySession,
  signSession,
  cookieOptions,
} from "@/lib/session";

// Paths that never require authentication.
const PUBLIC_PATHS = new Set<string>([
  "/login",
  "/api/auth/login",
  "/api/auth/logout",
]);

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  if (PUBLIC_PATHS.has(pathname)) {
    return NextResponse.next();
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySession(token) : null;

  if (!session) {
    // Block API calls with a 401; redirect page requests to /login.
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(loginUrl);
  }

  // Valid session → refresh it (sliding expiry): re-sign and reset the cookie.
  const res = NextResponse.next();
  const refreshed = await signSession({
    uid: session.uid,
    username: session.username,
  });
  res.cookies.set(SESSION_COOKIE, refreshed, cookieOptions());
  return res;
}

export const config = {
  // Run on everything except Next internals and static assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|fonts/).*)"],
};
