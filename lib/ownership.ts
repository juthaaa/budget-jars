import { prisma } from "@/lib/db";

// Models a request body can point at by id. Scoping the *query* by userId stops
// a user reading someone else's rows; this stops them writing a row that points
// at one — e.g. attaching a jar to a bank account they don't own, which would
// then leak that account's name back through the `include`.
type OwnedModel =
  | "bankAccount"
  | "paymentMethod"
  | "jar"
  | "incomeType"
  | "deductionType"
  | "expenseMaster"
  | "recurringExpense"
  | "installmentPlan"
  | "loanPlan"
  | "monthlyRecord";

/** True when `id` references nothing (null/undefined) or a row owned by `userId`. */
export async function owns(
  userId: number,
  model: OwnedModel,
  id: number | null | undefined,
): Promise<boolean> {
  if (id === null || id === undefined) return true;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = await (prisma as any)[model].findFirst({
    where: { id, userId },
    select: { id: true },
  });
  return row !== null;
}
