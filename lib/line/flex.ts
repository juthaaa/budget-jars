// Builds the "จดสำเร็จ" confirmation card sent back after a message is
// classified and saved. A message can contain several transactions, so this
// renders them as a list inside one bubble (with a total row) rather than a
// carousel — the whole batch stays readable without swiping. Each row carries
// its own date/time and its own edit/delete icons; the icons are decorative
// only (no postback action) — Phase 1 doesn't support editing from LINE yet.
import { MONTH_TH_SHORT } from "@/lib/utils";
import { formatNumber } from "@/lib/jar-calculator";
import type { ParsedTransaction } from "@/lib/classifier";

const INK = "#333333";
const MUTED = "#999999";
const SURFACE = "#FFF9FB";
const HAIRLINE = "#F2E3EA";
const OUT_COLOR = "#D6336C";
const OUT_BG = "#FCE4EC";
const IN_COLOR = "#2E9E5B";
const IN_BG = "#E3F6E8";

export interface FlexTransactionItem {
  parsed: ParsedTransaction;
  occurredAt: Date;
  jarName: string | null;
  paymentMethodName: string | null;
}

// occurredAt's UTC getters are read at face value as Bangkok wall-clock time —
// see the convention documented in lib/transaction-time.ts.
function formatDate(occurredAt: Date): string {
  const day = occurredAt.getUTCDate();
  const month = MONTH_TH_SHORT[occurredAt.getUTCMonth()];
  const year = occurredAt.getUTCFullYear() + 543;
  return `${day} ${month} ${year}`;
}

function formatTime(occurredAt: Date): string {
  const hh = String(occurredAt.getUTCHours()).padStart(2, "0");
  const mm = String(occurredAt.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function signedAmount(parsed: ParsedTransaction): string {
  return `${parsed.direction === "out" ? "-" : "+"}฿${formatNumber(parsed.amount)}`;
}

function tag(label: string, isOut: boolean): Record<string, unknown> {
  return {
    type: "box",
    layout: "vertical",
    flex: 0,
    backgroundColor: isOut ? OUT_BG : IN_BG,
    cornerRadius: "md",
    paddingAll: "4px",
    paddingStart: "8px",
    paddingEnd: "8px",
    contents: [
      {
        type: "text",
        text: label,
        size: "xxs",
        weight: "bold",
        color: isOut ? OUT_COLOR : IN_COLOR,
      },
    ],
  };
}

// One line per transaction: label chip + name on the left, amount on the
// right, then a muted meta line underneath carrying that row's own date/time
// (plus whatever else is known) and its edit/delete icons.
function itemRow(item: FlexTransactionItem): Record<string, unknown> {
  const { parsed, occurredAt, jarName, paymentMethodName } = item;
  const isOut = parsed.direction === "out";
  const meta = [
    `${formatDate(occurredAt)} ${formatTime(occurredAt)}`,
    paymentMethodName,
  ].filter(Boolean);

  return {
    type: "box",
    layout: "vertical",
    margin: "md",
    contents: [
      {
        type: "box",
        layout: "horizontal",
        alignItems: "center",
        contents: [
          {
            // horizontal, not baseline: a baseline box may only hold
            // text/icon/filler/span, and the tag chip is a box.
            type: "box",
            layout: "horizontal",
            alignItems: "center",
            flex: 1,
            spacing: "sm",
            contents: [
              tag(jarName ?? (isOut ? "รายจ่าย" : "รายรับ"), isOut),
              {
                type: "text",
                text: parsed.name,
                weight: "bold",
                size: "sm",
                color: INK,
                flex: 1,
                wrap: true,
              },
            ],
          },
          {
            type: "text",
            text: signedAmount(parsed),
            weight: "bold",
            size: "sm",
            color: isOut ? INK : IN_COLOR,
            align: "end",
            flex: 0,
          },
        ],
      },
      {
        type: "box",
        layout: "horizontal",
        alignItems: "center",
        margin: "xs",
        contents: [
          {
            type: "text",
            text: meta.join(" · "),
            size: "xxs",
            color: MUTED,
            flex: 1,
            wrap: true,
          },
          { type: "text", text: "✏️", size: "sm", flex: 0, margin: "md" },
          { type: "text", text: "❌", size: "sm", flex: 0, margin: "md" },
        ],
      },
    ],
  };
}

// Only rendered for a multi-item batch — a single row would just repeat itself.
function totalRows(items: FlexTransactionItem[]): Record<string, unknown>[] {
  const sum = (dir: "in" | "out") =>
    items
      .filter((i) => i.parsed.direction === dir)
      .reduce((acc, i) => acc + i.parsed.amount, 0);

  return (["out", "in"] as const)
    .map((dir) => ({ dir, total: sum(dir) }))
    .filter(({ total }) => total > 0)
    .map(({ dir, total }) => ({
      type: "box",
      layout: "horizontal",
      margin: "sm",
      contents: [
        {
          type: "text",
          text: dir === "out" ? "รวมรายจ่าย" : "รวมรายรับ",
          size: "xs",
          color: MUTED,
          flex: 1,
        },
        {
          type: "text",
          text: `${dir === "out" ? "-" : "+"}฿${formatNumber(total)}`,
          size: "sm",
          weight: "bold",
          color: dir === "out" ? INK : IN_COLOR,
          align: "end",
          flex: 0,
        },
      ],
    }));
}

export function buildTransactionFlex(items: FlexTransactionItem[]): Record<string, unknown> {
  const multi = items.length > 1;

  const rows: Record<string, unknown>[] = [];
  items.forEach((item, i) => {
    if (i > 0) rows.push({ type: "separator", margin: "md", color: HAIRLINE });
    rows.push(itemRow(item));
  });

  return {
    type: "bubble",
    body: {
      type: "box",
      layout: "vertical",
      backgroundColor: SURFACE,
      paddingAll: "20px",
      contents: [
        {
          type: "box",
          layout: "horizontal",
          alignItems: "center",
          contents: [
            {
              type: "box",
              layout: "vertical",
              flex: 1,
              contents: [
                {
                  type: "text",
                  text: multi ? `จดสำเร็จ ${items.length} รายการ ✅` : "จดสำเร็จ ✅",
                  weight: "bold",
                  size: "lg",
                  color: INK,
                },
                {
                  // No date here — every row now carries its own.
                  type: "text",
                  text: "อย่าลืมตรวจสอบรายการที่จดด้วยนะคะ",
                  size: "xs",
                  color: MUTED,
                  wrap: true,
                  margin: "xs",
                },
              ],
            },
            { type: "text", text: "📤", size: "md", flex: 0 },
          ],
        },
        { type: "separator", margin: "lg", color: HAIRLINE },
        ...rows,
        ...(multi
          ? [
              { type: "separator", margin: "lg", color: HAIRLINE },
              ...totalRows(items),
            ]
          : []),
      ],
    },
  };
}
