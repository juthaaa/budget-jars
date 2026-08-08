// Claude Haiku 4.5 provider — structured extraction via forced tool use.
// No thinking, no `effort`: Haiku 4.5 doesn't support adaptive thinking or
// the effort parameter (see the claude-api skill's model table), and this
// task is plain extraction, not reasoning, so neither would help.
import Anthropic from "@anthropic-ai/sdk";
import { buildNowLine, buildSystemPrompt, type JarSummary } from "./prompt";
import { ClassifierError, type ClassifierContext, type ParsedTransaction } from "./types";
import { logAiClassify } from "./log";
import { bangkokNowISODateTime } from "../transaction-time";

// Pinned to the exact snapshot rather than the `claude-haiku-4-5` alias so a
// prompt/schema tweak here can't silently start running against a different
// model build.
const MODEL = "claude-haiku-4-5-20251001";

// Lazy — `new Anthropic()` throws synchronously if no credentials are
// resolvable, and this module is imported at Next.js route-load time. Eager
// construction would 500 every request to the webhook (even ones that never
// reach classify(), like a bad-signature check) whenever ANTHROPIC_API_KEY is
// unset, instead of failing inside the one call site that needs it.
let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

function buildRecordTransactionTool(
  jarCodes: string[],
  paymentMethodCodes: string[],
): Anthropic.Tool {
  return {
    name: "record_transaction",
    description:
      "Record one income or expense transaction extracted from the user's message. Always call this at least once, even when the message is ambiguous or unrelated to money. When the message holds several transactions, call this tool once per transaction.",
    input_schema: {
      type: "object",
      properties: {
        direction: {
          type: "string",
          enum: ["in", "out"],
          description: '"out" = expense (the default), "in" = income',
        },
        amount: {
          type: "number",
          description: "Amount of money, always positive. Use 0 when unknown.",
        },
        name: {
          type: "string",
          description:
            "Short label for the transaction, in Thai, following the user's own wording.",
        },
        confidence: {
          type: "number",
          description: "0 to 1 — how sure you are the interpretation is correct.",
        },
        // Omitted entirely when there are no jars yet — an empty `enum` array
        // is invalid JSON Schema and would make the field unusable anyway.
        ...(jarCodes.length > 0
          ? {
              jarCode: {
                type: "string",
                enum: jarCodes,
                description:
                  "Code of the matching jar. Pick only from the codes listed here. Omit this field when unsure.",
              },
            }
          : {}),
        // Same rationale as jarCode above — omitted when there's nothing to enum.
        ...(paymentMethodCodes.length > 0
          ? {
              paymentMethodCode: {
                type: "string",
                enum: paymentMethodCodes,
                description:
                  "Code of the matching payment method. Pick only from the codes listed here. Omit this field when unsure or when the message states no payment method.",
              },
            }
          : {}),
        note: {
          type: "string",
          description:
            "Extra note, in Thai, if the message carries one. Omit this field when there is none.",
        },
        occurredAt: {
          type: "string",
          description:
            'Date and time of the transaction as "YYYY-MM-DDTHH:mm:00" (ISO 8601). Always required — derive the date from "now" as given in the system prompt (shifted by any relative Thai word such as เมื่อวาน or มะรืนนี้) and the time from what the message states (a clock time, or a Thai time-of-day word per the table in the system prompt). Never emit a bare relative word such as "yesterday".',
        },
      },
      required: ["direction", "amount", "name", "confidence", "occurredAt"],
    },
  };
}

// Loose shape of the tool_use.input we accept from the model before
// validation — everything optional/unknown because it's untrusted output.
interface RawToolInput {
  direction?: unknown;
  amount?: unknown;
  name?: unknown;
  confidence?: unknown;
  jarCode?: unknown;
  note?: unknown;
  paymentMethodCode?: unknown;
  occurredAt?: unknown;
}

function toParsedTransaction(raw: RawToolInput, rawText: string): ParsedTransaction {
  if (raw.direction !== "in" && raw.direction !== "out") {
    throw new ClassifierError(
      `AI ส่ง direction ที่ไม่รู้จัก: ${String(raw.direction)}`,
      rawText,
      raw,
    );
  }
  const amount = typeof raw.amount === "number" ? raw.amount : NaN;
  if (!Number.isFinite(amount) || amount < 0) {
    throw new ClassifierError(
      `AI ส่ง amount ที่ไม่ใช่ตัวเลขบวก: ${String(raw.amount)}`,
      rawText,
      raw,
    );
  }
  const confidence = typeof raw.confidence === "number" ? raw.confidence : NaN;
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new ClassifierError(
      `AI ส่ง confidence นอกช่วง 0-1: ${String(raw.confidence)}`,
      rawText,
      raw,
    );
  }
  const name = typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : rawText.trim();

  return {
    direction: raw.direction,
    amount,
    name,
    confidence,
    jarCode: typeof raw.jarCode === "string" && raw.jarCode ? raw.jarCode : null,
    note: typeof raw.note === "string" && raw.note ? raw.note : null,
    paymentMethodCode:
      typeof raw.paymentMethodCode === "string" && raw.paymentMethodCode
        ? raw.paymentMethodCode
        : null,
    occurredAt: typeof raw.occurredAt === "string" && raw.occurredAt ? raw.occurredAt : null,
  };
}

export async function classifyWithAnthropic(
  text: string,
  ctx: ClassifierContext,
): Promise<ParsedTransaction[]> {
  const jarCodes = ctx.jars.map((j: JarSummary) => j.code);
  const paymentMethodCodes = ctx.paymentMethods.map((p) => p.code);

  let response: Anthropic.Message;
  try {
    response = await getClient().messages.create({
      model: MODEL,
      max_tokens: 512,
      system: [
        {
          type: "text",
          text: buildSystemPrompt(ctx.jars, ctx.paymentMethods),
          // Ephemeral cache on the jar-list-appended prompt. Note: Haiku 4.5's
          // minimum cacheable prefix is 4096 tokens (see prompt-caching.md) —
          // with a handful of jars this system block usually won't reach that,
          // so cache_creation_input_tokens will read 0. Left on because it's
          // free when it doesn't apply and starts paying off automatically if
          // the jar list or prompt grows.
          cache_control: { type: "ephemeral" },
        },
        {
          type: "text",
          // Separate, uncached block: the current time changes on every
          // request (down to the minute, not just the day), so folding it
          // into the block above would bust that cache on every single call.
          text: buildNowLine(bangkokNowISODateTime()),
        },
      ],
      tools: [buildRecordTransactionTool(jarCodes, paymentMethodCodes)],
      // Force the tool every time — this is a structured-extraction endpoint,
      // never a chat turn, so there's no "auto" case to handle.
      tool_choice: { type: "tool", name: "record_transaction" },
      messages: [{ role: "user", content: text }],
    });
  } catch (err) {
    // SDK-level failure (network, auth, rate limit) — no response to log
    // usage/output for, but the input + error is still worth capturing.
    logAiClassify({
      rawText: text,
      jarCodes,
      paymentMethodCodes,
      model: MODEL,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }

  // Parallel tool use is on by default (disable_parallel_tool_use isn't
  // set), so a multi-item message yields one tool_use block per item.
  const toolUses = response.content.filter(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
  );
  if (toolUses.length === 0) {
    // Shouldn't happen with a forced tool_choice, but stop_reason could still
    // be "refusal" or similar — surface it rather than guessing.
    logAiClassify({
      rawText: text,
      jarCodes,
      paymentMethodCodes,
      model: MODEL,
      ok: false,
      error: `AI ไม่เรียก tool (stop_reason: ${response.stop_reason})`,
      usage: response.usage,
    });
    throw new ClassifierError(
      `AI ไม่เรียก tool (stop_reason: ${response.stop_reason})`,
      text,
    );
  }

  const parsedList: ParsedTransaction[] = [];
  let lastError: ClassifierError | undefined;
  for (const toolUse of toolUses) {
    try {
      const parsed = toParsedTransaction(toolUse.input as RawToolInput, text);
      parsedList.push(parsed);
      logAiClassify({
        rawText: text,
        jarCodes,
        paymentMethodCodes,
        model: MODEL,
        ok: true,
        output: parsed,
        rawOutput: toolUse.input,
        usage: response.usage,
      });
    } catch (err) {
      if (!(err instanceof ClassifierError)) throw err;
      lastError = err;
      logAiClassify({
        rawText: text,
        jarCodes,
        paymentMethodCodes,
        model: MODEL,
        ok: false,
        error: err.message,
        rawOutput: toolUse.input,
        usage: response.usage,
      });
    }
  }

  // Only bail out entirely when every item in the batch failed validation —
  // a message with one bad item and one good one should still save the good one.
  if (parsedList.length === 0 && lastError) throw lastError;
  return parsedList;
}
