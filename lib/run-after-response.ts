// Runs background work after a route has already sent its response — for the
// LINE webhook, which must reply 200 within ~1s while the AI classification
// call can take much longer.
//
// waitUntil() extends a Vercel function's lifetime until the given promise
// settles, since the runtime would otherwise freeze the function as soon as
// the response resolves. Outside Vercel (npm run dev, Docker) it reads from
// an unset global context and silently no-ops — the plain non-awaited
// promise below already keeps running on Node's event loop there, so no
// environment check is needed here.
import { waitUntil } from "@vercel/functions";

export function runAfterResponse(work: () => Promise<void>): void {
  const promise = work().catch((err) => {
    console.error("[runAfterResponse] background task failed", err);
  });
  waitUntil(promise);
}
