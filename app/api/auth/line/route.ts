// Signs a user in from inside LINE, using the LIFF ID token instead of a
// password. Public (see middleware.ts PUBLIC_PATHS) because it is what creates
// the session in the first place.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { signSession, cookieOptions, SESSION_COOKIE } from "@/lib/session";

export const runtime = "nodejs";

// LINE checks the token's signature, expiry and audience for us. Verifying
// server-side is the whole point: a client could put any userId in a request
// body, but it cannot forge a token LINE signed for this channel.
const VERIFY_ENDPOINT = "https://api.line.me/oauth2/v2.1/verify";

export async function POST(request: Request) {
  const channelId = process.env.LINE_LOGIN_CHANNEL_ID;
  if (!channelId) {
    console.error("[liff auth] LINE_LOGIN_CHANNEL_ID is not set");
    return NextResponse.json({ error: "server misconfigured" }, { status: 500 });
  }

  const body = await request.json().catch(() => ({}));
  const idToken = typeof body.idToken === "string" ? body.idToken : "";
  if (!idToken) {
    return NextResponse.json({ error: "id token required" }, { status: 400 });
  }

  const verified = await fetch(VERIFY_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ id_token: idToken, client_id: channelId }),
  });
  if (!verified.ok) {
    const detail = await verified.text().catch(() => "");
    console.warn("[liff auth] token rejected by LINE", verified.status, detail);
    return NextResponse.json({ error: "invalid id token" }, { status: 401 });
  }

  const claims: { sub?: string } = await verified.json();
  if (!claims.sub) {
    return NextResponse.json({ error: "invalid id token" }, { status: 401 });
  }

  // `sub` is the LINE userId — the same value the webhook sees, as long as the
  // LINE Login channel and the Messaging API channel sit under one provider.
  // Different providers give the same person different ids and nothing matches.
  const user = await prisma.user.findUnique({
    where: { lineUserId: claims.sub },
    select: { id: true, username: true },
  });
  if (!user) {
    return NextResponse.json({ error: "not_linked" }, { status: 403 });
  }

  const token = await signSession({ uid: user.id, username: user.username });
  const res = NextResponse.json({ ok: true, username: user.username });
  res.cookies.set(SESSION_COOKIE, token, cookieOptions());
  return res;
}
