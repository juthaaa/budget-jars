// Thin wrapper around the LINE Messaging API — just what this bot needs (reply only,
// text messages only). No SDK dependency; it's a single JSON POST.
import { logReply } from "@/lib/line/log";

const REPLY_ENDPOINT = "https://api.line.me/v2/bot/message/reply";

function getAccessToken(): string {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) throw new Error("LINE_CHANNEL_ACCESS_TOKEN is not set");
  return token;
}

export interface LineWebhookEvent {
  type: string;
  webhookEventId: string;
  replyToken?: string;
  message?: { type: string; id: string; text?: string };
}

export interface LineWebhookBody {
  events: LineWebhookEvent[];
}

// Fire-and-log: a reply failure shouldn't throw and crash the background job — the
// transaction is already saved by the time this runs, so the worst case is the user
// doesn't get a confirmation message.
async function sendReply(replyToken: string, messages: unknown[], logText: string): Promise<void> {
  try {
    const res = await fetch(REPLY_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getAccessToken()}`,
      },
      body: JSON.stringify({ replyToken, messages }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("[line] reply failed", res.status, body);
      logReply({ replyToken, text: logText, ok: false, status: res.status, responseBody: body });
      return;
    }
    logReply({ replyToken, text: logText, ok: true, status: res.status });
  } catch (err) {
    console.error("[line] reply threw", err);
    logReply({ replyToken, text: logText, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
}

export async function replyText(replyToken: string, text: string): Promise<void> {
  return sendReply(replyToken, [{ type: "text", text }], text);
}

// `contents` is a LINE Flex "bubble" (or "carousel") container — kept as
// `unknown` here so this transport layer stays free of the flex-layout shape;
// see lib/line/flex.ts for what actually builds it. `altText` is what shows
// in push notifications and chat list previews, where flex content doesn't
// render.
export async function replyFlex(replyToken: string, altText: string, contents: unknown): Promise<void> {
  return sendReply(replyToken, [{ type: "flex", altText, contents }], altText);
}
