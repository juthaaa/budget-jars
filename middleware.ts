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
  // LINE has no session cookie — authenticity comes from x-line-signature
  // verification inside the route itself, not from this middleware.
  "/api/line/webhook",
  // LIFF entry: these two exist to create a session, so they cannot require one.
  // Their proof of identity is a LINE-signed ID token, checked in the route.
  "/liff",
  "/api/auth/line",
]);

// LINE's in-app browser, e.g. "... Line/14.2.0". Someone arriving here without
// a session opened the app from LINE, so send them through the LIFF
// auto-login instead of a username/password form they'd have to fill in on a
// keyboard inside a chat app.
const LINE_IN_APP_BROWSER = /\bLine\/\d/;

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  if (PUBLIC_PATHS.has(pathname)) {
    return NextResponse.next();
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySession(token) : null;

  if (!session) {
    // Block API calls with a 401; redirect page requests to a sign-in page.
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    const fromLine = LINE_IN_APP_BROWSER.test(req.headers.get("user-agent") ?? "");
    const signInUrl = req.nextUrl.clone();
    signInUrl.pathname = fromLine ? "/liff" : "/login";
    signInUrl.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(signInUrl);
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
