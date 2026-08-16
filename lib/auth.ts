// Server-side session lookup for route handlers. middleware.ts already rejects
// anonymous requests, so `currentUserId()` returning null means the cookie was
// stripped between the two — but every route still checks, because the id it
// returns is what scopes the query to one user's data.
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

export async function currentUserId(): Promise<number | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  const session = token ? await verifySession(token) : null;
  return session?.uid ?? null;
}

export function unauthorized(): NextResponse {
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

export function notFound(): NextResponse {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

/** Runs an update/delete whose `where` is scoped to the session user, e.g.
 *  `{ id, userId }`. Prisma raises P2025 when that matches nothing — the row is
 *  gone, or it belongs to someone else. Both look identical from here, so both
 *  come back as null for the caller to turn into a 404. */
export async function scopedWrite<T>(run: () => Promise<T>): Promise<T | null> {
  try {
    return await run();
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return null;
    }
    throw err;
  }
}

/** A row referenced by the request body that belongs to someone else. Reported
 *  as a bad request rather than 403 — from this user's side the id simply
 *  doesn't exist. */
export function badReference(): NextResponse {
  return NextResponse.json({ error: "อ้างอิงข้อมูลที่ไม่มีอยู่" }, { status: 400 });
}
