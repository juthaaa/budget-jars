import { prisma } from "@/lib/db";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

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
