// Public entry point for the AI layer. Callers (the LINE webhook, later a
// seed-transactions endpoint) only ever import from here — never reach into
// ./anthropic directly, so swapping/adding a provider stays a one-file change.
import { classifyWithAnthropic } from "./anthropic";
import type { ClassifierContext, ParsedTransaction } from "./types";

export type { ClassifierContext, ParsedTransaction } from "./types";
export { ClassifierError } from "./types";
export type { JarSummary, PaymentMethodSummary } from "./prompt";

export async function classify(
  text: string,
  ctx: ClassifierContext,
): Promise<ParsedTransaction[]> {
  const provider = process.env.AI_PROVIDER ?? "anthropic";
  switch (provider) {
    case "anthropic":
      return classifyWithAnthropic(text, ctx);
    default:
      // GLM/z.ai is future work (to-do.yaml phase 3, task 3.5) — not wired
      // up yet, so fail loudly instead of silently falling back to Anthropic.
      throw new Error(
        `AI_PROVIDER="${provider}" ยังไม่รองรับ — ตอนนี้มีแค่ "anthropic"`,
      );
  }
}
