import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { currentUserId, unauthorized } from "@/lib/auth";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

export async function GET() {
  const userId = await currentUserId();
  if (userId === null) return unauthorized();

  const records = await prisma.monthlyRecord.findMany({
    where: { userId },
    orderBy: [{ year: "desc" }, { month: "desc" }],
    include: {
      allocations: { include: { jar: true } },
      expenses: true,
      monthlyIncomes: { include: { incomeType: { select: { excludeFromNet: true } } } },
      deductions: true,
    },
  });
  return NextResponse.json(
    records.map(({ monthlyIncomes, deductions, ...r }) => {
      const grossIncome =
        monthlyIncomes.length > 0
          ? monthlyIncomes
              .filter((i) => !i.incomeType.excludeFromNet)
              .reduce((s, i) => s + i.amount, 0)
          : 0;
      const taxWithheld = deductions.reduce((s, d) => s + d.amount, 0);
      return { ...r, grossIncome, taxWithheld, netIncome: grossIncome - taxWithheld };
    })
  );
}

export async function POST(request: Request) {
  const userId = await currentUserId();
  if (userId === null) return unauthorized();

  const body = await request.json();
  const { year, month } = body;

  const existing = await prisma.monthlyRecord.findUnique({
    where: { userId_year_month: { userId, year, month } },
  });
  if (existing) {
    return NextResponse.json({ error: "Month already exists" }, { status: 400 });
  }

  // Get latest salary for pre-fill
  const latestSalary = await prisma.salaryHistory.findFirst({
    where: { userId, effectiveDate: { lte: new Date(Date.UTC(year, month - 1, 1)) } },
    orderBy: { effectiveDate: "desc" },
  });

  const salaryFromHistory = latestSalary?.amount ?? 0;

  // Get NEC jar default %
  const necJar = await prisma.jar.findFirst({ where: { userId, isNec: true } });
  const necAmount = necJar ? salaryFromHistory * (necJar.percentage / 100) : 0;

  const record = await prisma.monthlyRecord.create({
    data: {
      userId,
      year,
      month,
      necAmount,
      necIsManual: false,
    },
  });

  // Create default jar allocations
  const jars = await prisma.jar.findMany({ where: { userId } });
  const remaining = salaryFromHistory - necAmount;
  await prisma.jarAllocation.createMany({
    data: jars.map((jar) => ({
      userId,
      monthlyRecordId: record.id,
      jarId: jar.id,
      amount: jar.isNec ? necAmount : remaining * (jar.percentage / 100),
    })),
  });

  // Auto-seed expenses from RecurringExpense rules active for this month
  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const ym = year * 12 + (month - 1);

  const allRecurring = await db.recurringExpense.findMany({
    where: {
      userId,
      AND: [
        { OR: [{ startDate: null }, { startDate: { lte: monthStart } }] },
        { OR: [{ endDate: null }, { endDate: { gte: monthStart } }] },
      ],
    },
    include: {
      installmentPlan: { select: { note: true } },
      loanPlan: { select: { note: true } },
    },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });

  type RecurringRow = {
    id: number;
    name: string;
    jarCode: string;
    amount: number;
    paymentMethodId: number | null;
    startDate: Date | null;
    installmentPlanId: number | null;
    loanPlanId: number | null;
    loanItemKind: string | null;
    intervalValue: number;
    intervalUnit: string;
    note: string | null;
    installmentPlan: { note: string | null } | null;
    loanPlan: { note: string | null } | null;
  };

  // Filter by interval for regular recurring (installment/loan children rely on exact startDate=endDate)
  const filtered = allRecurring.filter((r: RecurringRow) => {
    if (r.installmentPlanId !== null || r.loanPlanId !== null) return true;
    if (!r.startDate) {
      const effectiveInterval = r.intervalUnit === "year" ? r.intervalValue * 12 : r.intervalValue;
      return ym % effectiveInterval === 0;
    }
    const startYm =
      new Date(r.startDate).getUTCFullYear() * 12 + new Date(r.startDate).getUTCMonth();
    const diffMonths = ym - startYm;
    if (diffMonths < 0) return false;
    const effectiveInterval = r.intervalUnit === "year" ? r.intervalValue * 12 : r.intervalValue;
    return diffMonths % effectiveInterval === 0;
  });

  if (filtered.length > 0) {
    await db.expense.createMany({
      data: filtered.map((r: RecurringRow) => ({
        userId,
        monthlyRecordId: record.id,
        name: r.name,
        jarCode: r.jarCode,
        amount: r.amount,
        paymentMethodId: r.paymentMethodId,
        bankAccountId: null,
        note: r.note ?? r.installmentPlan?.note ?? r.loanPlan?.note ?? null,
        recurringExpenseId: r.id,
        // A loan's scheduled-payment child seeds in locked (the user asked
        // that a seeded installment be un-editable in the month, since
        // fixing it means re-seeding, not hand-editing). Its prepay sibling
        // seeds in unlocked, since deleting it back out is the normal way to
        // record "no โปะ this month".
        isLocked: r.loanPlanId !== null && r.loanItemKind !== "prepay",
      })),
    });
  }

  return NextResponse.json(record, { status: 201 });
}
