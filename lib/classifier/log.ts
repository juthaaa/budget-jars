// Structured logging for AI classifier calls — captures the exact
// input/output of each classify() call so prompt/schema issues can be
// diagnosed from the log instead of reproduced live. Node-only (writeLog uses
// fs locally), same rationale as lib/line/log.ts.
import { writeLog } from "@/lib/log-sink";

const AI_LOG = "ai-classify.log";

export function logAiClassify(entry: {
  rawText: string;
  jarCodes: string[];
  paymentMethodCodes: string[];
  model: string;
  ok: boolean;
  /** Validated ParsedTransaction, only present when ok is true. */
  output?: unknown;
  /** Raw tool_use.input as returned by the model, before validation. */
  rawOutput?: unknown;
  error?: string;
  usage?: unknown;
}): void {
  writeLog(AI_LOG, entry);
}
