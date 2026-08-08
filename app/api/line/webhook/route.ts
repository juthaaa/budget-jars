// LINE Messaging API webhook — Phase 1 scope only: parse a text message with
// AI, save it to the standalone Transaction table, reply. Deliberately does
// not touch MonthlyRecord/Expense/Jar — see ManageCash/to-do.yaml phase 2 for
// the eventual seed-into-month step.
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { verifySignature } from "@/lib/line/signature";
import { replyText, replyFlex, type LineWebhookBody, type LineWebhookEvent } from "@/lib/line/client";
import { buildTransactionFlex, type FlexTransactionItem } from "@/lib/line/flex";
import { classify, ClassifierError, type ParsedTransaction } from "@/lib/classifier";
import { resolveOccurredAt, type ResolvedOccurredAt } from "@/lib/transaction-time";
import { formatNumber } from "@/lib/jar-calculator";
import { runAfterResponse } from "@/lib/run-after-response";
import { logAccess } from "@/lib/line/log";

// Needs Node's crypto (signature verification) and Prisma — can't run on the edge.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The 200 goes out in well under a second, but runAfterResponse() keeps the
// function alive for the classify + persist work behind it — an Anthropic call
// plus several Turso round trips. That would overrun Vercel's 10s default and
// get killed mid-write, so raise the ceiling (60s is the Hobby-plan max).
export const maxDuration = 30;

const FAILED_REPLY = 'ไม่เข้าใจข้อความนี้ ลองพิมพ์แบบ "ข้าวเที่ยง 60"';
const ERROR_REPLY = "บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง";

export async function POST(request: Request) {
  // Read the raw body before anything else parses it — verifySignature needs
  // the exact bytes LINE signed; request.json() would consume the stream and
  // leave nothing for the HMAC check.
  const raw = await request.text();
  const signature = request.headers.get("x-line-signature");

  let signatureOk: boolean;
  try {
    signatureOk = verifySignature(raw, signature);
  } catch (err) {
    // LINE_CHANNEL_SECRET missing — a config error, not a client error.
    console.error("[line webhook] signature check failed", err);
    return NextResponse.json({ error: "server misconfigured" }, { status: 500 });
  }
  if (!signatureOk) {
    logAccess({ signatureOk: false, eventCount: 0, eventTypes: [], webhookEventIds: [] });
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let body: LineWebhookBody;
  try {
    body = JSON.parse(raw);
  } catch {
    logAccess({ signatureOk: true, eventCount: 0, eventTypes: [], webhookEventIds: [] });
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const events = Array.isArray(body.events) ? body.events : [];
  logAccess({
    signatureOk: true,
    eventCount: events.length,
    eventTypes: events.map((e) => e.type),
    webhookEventIds: events.map((e) => e.webhookEventId),
  });

  // Reply within LINE's ~1s window, then classify + persist in the
  // background — the AI call alone can take longer than that.
  runAfterResponse(async () => {
    for (const event of events) {
      await processEvent(event);
    }
  });

  return NextResponse.json({ ok: true });
}

// A message can now yield multiple transactions (e.g. "ข้าว 30\nน้ำ 20"), so
// each row's externalId is the webhookEventId plus its item index rather than
// the bare webhookEventId — see createTransactionRow().
function externalIdFor(webhookEventId: string, index: number): string {
  return `${webhookEventId}:${index}`;
}

async function processEvent(event: LineWebhookEvent): Promise<void> {
  if (event.type !== "message" || event.message?.type !== "text") return;
  const text = event.message.text?.trim();
  if (!text) return;

  try {
    // LINE retries undelivered webhooks; webhookEventId is stable per
    // delivery attempt. Item 0 always exists for a processed event, so
    // checking it is enough to dedupe the whole batch on retry.
    const already = await prisma.transaction.findUnique({
      where: { externalId: externalIdFor(event.webhookEventId, 0) },
      select: { id: true },
    });
    if (already) return;

    const jars = await prisma.jar.findMany({
      select: { code: true, name: true },
      orderBy: { sortOrder: "asc" },
    });
    const paymentMethods = await prisma.paymentMethod.findMany({
      select: { code: true, name: true },
      orderBy: { sortOrder: "asc" },
    });

    let parsedList: ParsedTransaction[];
    try {
      parsedList = await classify(text, { jars, paymentMethods });
    } catch (err) {
      if (!(err instanceof ClassifierError)) throw err;
      // AI ran but its output didn't validate — record it as a failed
      // classification (with whatever raw output it gave, for replay after
      // a prompt fix) rather than a system error.
      console.warn("[line webhook] classifier rejected AI output:", err.message);
      parsedList = [degenerateParsed(text)];
    }

    const saved: FlexTransactionItem[] = [];
    let anySaved = false;
    for (let i = 0; i < parsedList.length; i++) {
      const parsed = parsedList[i];
      const status = parsed.confidence > 0 && parsed.amount > 0 ? "pending" : "failed";
      const resolved = resolveOccurredAt(parsed.occurredAt);
      const row = await createTransactionRow(event, i, text, parsed, status, resolved);
      if (!row) continue; // a concurrent delivery already saved this item
      anySaved = true;
      if (status === "pending") {
        saved.push({
          parsed,
          occurredAt: resolved.occurredAt,
          jarName: jars.find((j) => j.code === parsed.jarCode)?.name ?? null,
          paymentMethodName:
            paymentMethods.find((p) => p.code === parsed.paymentMethodCode)?.name ?? null,
        });
      }
    }

    if (!anySaved) return; // a concurrent delivery already saved this whole batch

    if (event.replyToken) {
      if (saved.length === 0) {
        await replyText(event.replyToken, FAILED_REPLY);
      } else {
        await replyFlex(
          event.replyToken,
          buildReplyText(saved.map((s) => s.parsed)),
          buildTransactionFlex(saved),
        );
      }
    }
  } catch (err) {
    console.error("[line webhook] failed to process event", event.webhookEventId, err);
    if (event.replyToken) await replyText(event.replyToken, ERROR_REPLY);
  }
}

// Used when the classifier itself threw (bad schema, no tool_use block) —
// there's no valid ParsedTransaction to fall back to, so persist the raw
// text as its own "name" with a zero amount, matching the shape the AI
// itself returns for unrelated messages (see prompt.ts's "สวัสดี" example).
function degenerateParsed(text: string): ParsedTransaction {
  return {
    direction: "out",
    amount: 0,
    name: text,
    confidence: 0,
    jarCode: null,
    note: null,
    paymentMethodCode: null,
    occurredAt: null,
  };
}

async function createTransactionRow(
  event: LineWebhookEvent,
  index: number,
  rawText: string,
  parsed: ParsedTransaction,
  status: "pending" | "failed",
  resolved: ResolvedOccurredAt,
) {
  const { occurredAt, year, month } = resolved;
  try {
    return await prisma.transaction.create({
      data: {
        source: "line",
        externalId: externalIdFor(event.webhookEventId, index),
        rawText,
        parsed: JSON.stringify(parsed),
        confidence: parsed.confidence,
        status,
        direction: parsed.direction,
        name: parsed.name,
        amount: parsed.amount,
        jarCode: parsed.jarCode,
        note: parsed.note,
        paymentMethodCode: parsed.paymentMethodCode,
        occurredAt,
        year,
        month,
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return null; // duplicate delivery raced us — already saved
    }
    throw err;
  }
}

// `saved` is only the successfully-saved ("pending") items — callers only
// reach here when bubbles.length > 0, so `saved` is never empty.
function buildReplyText(saved: ParsedTransaction[]): string {
  const [first, ...rest] = saved;
  const verb = first.direction === "out" ? "จ่าย" : "รับ";
  const jarTxt = first.jarCode ? ` (${first.jarCode})` : "";
  const base = `${verb}: ${first.name} ${formatNumber(first.amount)} บาท${jarTxt}`;
  return rest.length > 0 ? `${base} และอีก ${rest.length} รายการ` : base;
}
