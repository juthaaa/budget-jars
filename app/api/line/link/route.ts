import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { currentUserId, unauthorized } from "@/lib/auth";
import { issueLinkCode, LINK_CODE_TTL_MINUTES } from "@/lib/line/link-code";

// Needs Node's crypto for the code draw.
export const runtime = "nodejs";

/** Current link status for the signed-in user. */
export async function GET() {
  const userId = await currentUserId();
  if (userId === null) return unauthorized();

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { lineUserId: true },
  });

  return NextResponse.json({
    linked: !!user?.lineUserId,
    // The full id is long and only useful as a fingerprint when checking which
    // account is attached — a prefix is enough to tell two apart.
    lineUserIdPreview: user?.lineUserId ? `${user.lineUserId.slice(0, 9)}…` : null,
  });
}

/** Issues a code for the user to send to the bot as "link <code>". */
export async function POST() {
  const userId = await currentUserId();
  if (userId === null) return unauthorized();

  const { code, expiresAt } = await issueLinkCode(userId);
  return NextResponse.json({ code, expiresAt, ttlMinutes: LINK_CODE_TTL_MINUTES });
}

/** Detaches the LINE account. Messages from it stop being recorded. */
export async function DELETE() {
  const userId = await currentUserId();
  if (userId === null) return unauthorized();

  await prisma.user.update({
    where: { id: userId },
    data: { lineUserId: null, lineLinkCode: null, lineLinkCodeExpiresAt: null },
  });
  return NextResponse.json({ ok: true });
}
