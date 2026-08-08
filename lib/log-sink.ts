// One place that decides where a structured log line goes.
//
// Locally we append to files under logs/ so the request history survives
// across dev-server restarts. On Vercel that path is read-only — only /tmp is
// writable there, and it doesn't outlive the instance — so every append would
// throw EROFS and the line would be lost. There we print the same JSON to
// stdout instead and let Vercel's runtime logs hold it.
import fs from "fs";
import path from "path";

const ON_VERCEL = Boolean(process.env.VERCEL);
const LOG_DIR = path.join(process.cwd(), "logs");

/** `file` is the log's name (e.g. "line-reply.log") — also emitted as the
 *  `log` field so the streams stay separable once they're merged into stdout. */
export function writeLog(file: string, entry: Record<string, unknown>): void {
  const line = JSON.stringify({ time: new Date().toISOString(), log: file, ...entry });

  if (ON_VERCEL) {
    console.log(line);
    return;
  }

  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(path.join(LOG_DIR, file), line + "\n");
  } catch (err) {
    console.error("[log] failed to write", file, err);
  }
}
