import { prisma } from "@/lib/db";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

// No userId filter here on purpose: `monthlyRecordId` always comes from a
// record the caller already looked up scoped to the session user, and the
// settlement row hangs off that record.
export async function isPaymentMethodLocked(
  monthlyRecordId: number,
  paymentMethodId: number | null | undefined,
): Promise<boolean> {
  if (!paymentMethodId) return false;
  const s = await db.monthlyPaymentSettlement.findUnique({
    where: { monthlyRecordId_paymentMethodId: { monthlyRecordId, paymentMethodId } },
    select: { reconciledAt: true },
  });
  return !!s?.reconciledAt;
}
