// Linking a LINE account to an app user, without LIFF or a LINE Login channel.
//
// The app issues a short-lived code to a logged-in user; the user sends it to
// the bot as "link 123456". That message reaches the webhook with a LINE userId
// that LINE itself signed for (see lib/line/signature.ts), so the pairing is
// trustworthy in both directions: the code proves who the app user is, the
// signature proves who the LINE sender is.
import crypto from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export const LINK_CODE_TTL_MINUTES = 10;

/** "link 123456" — the prefix is required so a bare number stays an expense. */
export const LINK_COMMAND = /^link\s+(\d{6})$/i;

export interface IssuedLinkCode {
  code: string;
  expiresAt: Date;
}

/** Issues a fresh code for `userId`, replacing any code it already had. */
export async function issueLinkCode(userId: number): Promise<IssuedLinkCode> {
  const expiresAt = new Date(Date.now() + LINK_CODE_TTL_MINUTES * 60_000);

  // The column is unique, so a collision with another user's live code is a
  // P2002 rather than a silent overwrite. Six digits over a handful of users
  // makes that vanishingly rare — just draw again.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
    try {
      await prisma.user.update({
        where: { id: userId },
        data: { lineLinkCode: code, lineLinkCodeExpiresAt: expiresAt },
      });
      return { code, expiresAt };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") continue;
      throw err;
    }
  }
  throw new Error("could not generate an unused link code");
}

export type LinkResult =
  | { status: "linked"; username: string }
  | { status: "already" } // this LINE account is already linked — e.g. a retried delivery
  | { status: "taken" } // the LINE account belongs to a different app user
  | { status: "invalid" }; // no such code, or it expired

/** Consumes `code` on behalf of the LINE account that sent it. */
export async function consumeLinkCode(
  code: string,
  lineUserId: string,
): Promise<LinkResult> {
  const alreadyLinked = await prisma.user.findUnique({
    where: { lineUserId },
    select: { id: true },
  });

  const target = await prisma.user.findFirst({
    where: { lineLinkCode: code, lineLinkCodeExpiresAt: { gt: new Date() } },
    select: { id: true, username: true },
  });

  if (!target) {
    // A used code plus an already-linked sender is the retry case, not an error.
    return alreadyLinked ? { status: "already" } : { status: "invalid" };
  }
  if (alreadyLinked && alreadyLinked.id !== target.id) {
    return { status: "taken" };
  }

  try {
    await prisma.user.update({
      where: { id: target.id },
      data: { lineUserId, lineLinkCode: null, lineLinkCodeExpiresAt: null },
    });
  } catch (err) {
    // Another delivery claimed this LINE account between the read and the write.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { status: "taken" };
    }
    throw err;
  }

  return { status: "linked", username: target.username };
}
