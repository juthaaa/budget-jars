import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { currentUserId, unauthorized } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await currentUserId();
  if (userId === null) return unauthorized();

  const records = await prisma.monthlyRecord.findMany({
    where: { userId },
    orderBy: [{ year: "asc" }, { month: "asc" }],
    include: {
      expenses: { select: { amount: true, jarCode: true } },
      monthlyIncomes: { include: { incomeType: { select: { excludeFromNet: true } } } },
      deductions: { select: { amount: true } },
    },
  });

  const data = records.map(({ monthlyIncomes, deductions, ...r }) => {
    const grossIncome =
      monthlyIncomes.length > 0
        ? monthlyIncomes
            .filter((i) => !i.incomeType.excludeFromNet)
            .reduce((s, i) => s + i.amount, 0)
        : 0;
    const taxWithheld = deductions.reduce((s, d) => s + d.amount, 0);
    return {
      year: r.year,
      month: r.month,
      yearMonth: `${r.year}-${String(r.month).padStart(2, "0")}`,
      label: `${MONTH_TH[r.month - 1]} ${r.year + 543}`,
      netIncome: grossIncome - taxWithheld,
      necAmount: r.necAmount,
      totalExpenses: r.expenses.reduce((s, e) => s + e.amount, 0),
    };
  });

  return NextResponse.json(data);
}

const MONTH_TH = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];
