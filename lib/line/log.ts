// Structured logging for the LINE webhook — separate from console.error so the
// request/reply history survives even when nobody is watching the terminal.
// Node-only (writeLog uses fs locally), same runtime restriction as the rest
// of lib/line.
import { writeLog } from "@/lib/log-sink";

const ACCESS_LOG = "line-access.log";
const REPLY_LOG = "line-reply.log";

export function logAccess(entry: {
  signatureOk: boolean;
  eventCount: number;
  eventTypes: string[];
  webhookEventIds: string[];
}): void {
  writeLog(ACCESS_LOG, entry);
}

export function logReply(entry: {
  replyToken: string;
  text: string;
  ok: boolean;
  status?: number;
  responseBody?: string;
  error?: string;
}): void {
  const { replyToken, ...rest } = entry;
  // A reply token is a short-lived, single-use credential for the Messaging
  // API. The prefix is enough to line a reply up with its access-log entry;
  // the rest has no business sitting in a log Vercel retains.
  writeLog(REPLY_LOG, { replyTokenPrefix: replyToken.slice(0, 8), ...rest });
}
