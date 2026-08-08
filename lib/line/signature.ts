// Node-only: verifies the `x-line-signature` header LINE sends on every webhook
// request. Must run against the raw request body (before any JSON.parse), or the
// HMAC won't match. See app/api/line/webhook/route.ts for the call site.
import crypto from "crypto";

function getChannelSecret(): string {
  const secret = process.env.LINE_CHANNEL_SECRET;
  if (!secret) throw new Error("LINE_CHANNEL_SECRET is not set");
  return secret;
}

export function verifySignature(rawBody: string, signatureHeader: string | null): boolean {
  if (!signatureHeader) return false;

  const expected = crypto
    .createHmac("sha256", getChannelSecret())
    .update(rawBody)
    .digest();

  let provided: Buffer;
  try {
    provided = Buffer.from(signatureHeader, "base64");
  } catch {
    return false;
  }

  // Lengths must match before timingSafeEqual — it throws otherwise.
  if (provided.length !== expected.length) return false;
  return crypto.timingSafeEqual(expected, provided);
}
