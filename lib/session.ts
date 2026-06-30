// Edge-safe session helpers (jose only — NO bcrypt here, so this can be
// imported from middleware which runs on the edge runtime).
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "session";

// Sliding session window (minutes). Configurable via env, default 60.
export const TTL_MINUTES = Number(process.env.SESSION_TTL_MINUTES ?? 60);

export interface SessionPayload {
  uid: number;
  username: string;
}

function getSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set");
  return new TextEncoder().encode(secret);
}

// Shared cookie options used by both the login route and the middleware refresh.
export function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: TTL_MINUTES * 60,
  };
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ uid: payload.uid, username: payload.username })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${TTL_MINUTES}m`)
    .sign(getSecret());
}

export async function verifySession(
  token: string
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (typeof payload.uid === "number" && typeof payload.username === "string") {
      return { uid: payload.uid, username: payload.username };
    }
    return null;
  } catch {
    return null;
  }
}
