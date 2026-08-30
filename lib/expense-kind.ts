// "expense" = รายจ่ายปกติ (หักงบ Jar) | "withdrawal" = รายการเบิก — จ่ายผ่าน
// payment method จริงจึงรวมในยอดโอน แต่ไม่กินงบ Jar เพราะจะได้เงินคืนภายหลัง.
// ดู app/month/[yearMonth]/page.tsx (getJarSpent, bankSummary, groupedExpenses).
export const EXPENSE_KIND = {
  expense: "expense",
  withdrawal: "withdrawal",
} as const;

export type ExpenseKind = (typeof EXPENSE_KIND)[keyof typeof EXPENSE_KIND];

// Normalize a raw (kind, jarCode) pair coming from the client: any kind other
// than "withdrawal" collapses to "expense", and a withdrawal always stores an
// empty jarCode — it doesn't belong to any jar, so no jar picker value from a
// stale form should ever leak into the DB.
export function normalizeExpenseKind(
  rawKind: unknown,
  rawJarCode: string,
): { kind: ExpenseKind; jarCode: string } {
  if (rawKind === EXPENSE_KIND.withdrawal) {
    return { kind: EXPENSE_KIND.withdrawal, jarCode: "" };
  }
  return { kind: EXPENSE_KIND.expense, jarCode: rawJarCode };
}
