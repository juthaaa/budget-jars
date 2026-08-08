import type { JarSummary, PaymentMethodSummary } from "./prompt";

// What the classifier hands back to the caller. Mirrors the shape of the
// Transaction table's AI-derived columns (see prisma/schema.prisma) but is
// intentionally decoupled from it — this is the classifier's own contract,
// not a Prisma type, so the AI layer has no dependency on the DB layer.
export interface ParsedTransaction {
  direction: "in" | "out";
  amount: number;
  name: string;
  confidence: number;
  jarCode: string | null;
  note: string | null;
  paymentMethodCode: string | null;
  /** ISO 8601, or null when the message didn't specify a date/time. */
  occurredAt: string | null;
}

export interface ClassifierContext {
  /** Jars to offer the model as the jarCode enum. Empty array is fine. */
  jars: JarSummary[];
  /** Payment methods to offer the model as the paymentMethodCode enum. Empty array is fine. */
  paymentMethods: PaymentMethodSummary[];
}

// Thrown for domain-level failures (no tool_use block, unparsable amount,
// out-of-range confidence). SDK errors (network, rate limit, auth) are not
// wrapped — they propagate as the SDK's own typed exceptions so callers can
// use the normal Anthropic.APIError chain to distinguish retryable failures.
export class ClassifierError extends Error {
  constructor(
    message: string,
    readonly rawText: string,
    /** The malformed tool_use.input, when one was returned — lets a caller
     *  persist it for replay after a prompt fix. Undefined when the model
     *  never called the tool at all (nothing to capture). */
    readonly raw?: unknown,
  ) {
    super(message);
    this.name = "ClassifierError";
  }
}
