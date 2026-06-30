import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { calculateJarAllocations } from "@/lib/jar-calculator";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;
type IncomeTypeRow = { id: number; code: string; name: string; excludeFromNet: boolean; sortOrder: number };
type MonthlyIncomeRow = { incomeTypeId: number; amount: number };

function parseYearMonth(ym: string) {
  const [y, m] = ym.split("-");
  return { year: parseInt(y), month: parseInt(m) };
}

export async function GET(
  _req: Request,
  { params }: { params: { yearMonth: string } }
) {
  const { year, month } = parseYearMonth(params.yearMonth);
  const record = await prisma.monthlyRecord.findUnique({
    where: { year_month: { year, month } },
    include: {
      allocations: { include: { jar: { include: { bankAccount: true } }, bankAccount: true } },
      expenses: {
        include: {
          bankAccount: true,
          paymentMethod: { select: { id: true, name: true } },
          recurringExpense: {
            select: {
              installmentNumber: true,
              installmentPlan: { select: { totalInstallments: true } },
            },
          },
        },
        orderBy: { createdAt: "asc" },
      },
      deductions: { include: { deductionType: true } },
      monthlyIncomes: true,
      paymentSettlements: {
        select: { paymentMethodId: true, paidAt: true, reconciledAt: true },
      },
      bankTransfers: {
        select: { bankAccountId: true, transferredAt: true },
      },
    },
  });
  if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Look up effective salary from SalaryHistory (used for SALARY default + %-type deduction rules)
  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const historySalary = await prisma.salaryHistory.findFirst({
    where: { effectiveDate: { lte: monthStart } },
    orderBy: { effectiveDate: "desc" },
  });
  const effectiveSalary = historySalary?.amount ?? 0;

  // For each deduction type, return saved amount OR computed default from latest rule
  const types = await prisma.deductionType.findMany({
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });

  const deductionsList = [];
  for (const type of types) {
    const saved = record.deductions.find((d) => d.deductionTypeId === type.id);
    let amount = saved?.amount ?? 0;
    let isDefault = false;
    if (!saved) {
      const rule = await prisma.deductionRule.findFirst({
        where: { deductionTypeId: type.id, effectiveDate: { lte: monthStart } },
        orderBy: { effectiveDate: "desc" },
      });
      if (rule) {
        amount = rule.valueType === "percent"
          ? parseFloat(((effectiveSalary * rule.value) / 100).toFixed(2))
          : rule.value;
        isDefault = true;
      }
    }
    deductionsList.push({
      deductionTypeId: type.id,
      code: type.code,
      name: type.name,
      amount,
      isDefault,
    });
  }

  // Build incomeList (similar to deductionsList)
  const incomeTypes: IncomeTypeRow[] = await db.incomeType.findMany({
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });

  const savedIncomes: MonthlyIncomeRow[] = record.monthlyIncomes as MonthlyIncomeRow[];
  const incomeList = [];
  for (const type of incomeTypes) {
    const saved = savedIncomes.find((i) => i.incomeTypeId === type.id);
    let amount = saved?.amount ?? 0;
    let isDefault = false;
    if (!saved) {
      if (type.code === "SALARY") {
        amount = effectiveSalary;
        isDefault = effectiveSalary > 0;
      } else {
        isDefault = true;
      }
    }
    incomeList.push({
      incomeTypeId: type.id,
      code: type.code,
      name: type.name,
      excludeFromNet: type.excludeFromNet,
      amount,
      isDefault,
    });
  }

  return NextResponse.json({
    ...record,
    deductionsList,
    incomeList,
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: { yearMonth: string } }
) {
  const { year, month } = parseYearMonth(params.yearMonth);
  const body = await request.json();

  const {
    incomes,     // array of { incomeTypeId, amount }
    necAmount,
    necIsManual = false,
    deductions,  // array of { deductionTypeId, amount }
    jarPercentages,
    jarBankAccounts, // optional: { [jarId]: bankAccountId } — key absent = no override
  } = body;

  // Calculate grossIncome from non-excluded income types
  let grossIncome = body.grossIncome ?? 0;

  if (Array.isArray(incomes) && incomes.length > 0) {
    const incomeTypes: IncomeTypeRow[] = await db.incomeType.findMany();
    const typeMap = new Map<number, IncomeTypeRow>(incomeTypes.map((t) => [t.id, t]));
    grossIncome = incomes.reduce((s: number, i: { incomeTypeId: number; amount: number }) => {
      const t = typeMap.get(i.incomeTypeId);
      return t && !t.excludeFromNet ? s + (i.amount || 0) : s;
    }, 0);
  }

  const taxWithheld = Array.isArray(deductions)
    ? deductions.reduce((s: number, d: { amount: number }) => s + (d.amount || 0), 0)
    : 0;
  const netIncome = grossIncome - taxWithheld;

  // Existing record + allocations + transfers — needed to enforce transfer locks
  const existing = await prisma.monthlyRecord.findUnique({
    where: { year_month: { year, month } },
    include: {
      allocations: true,
      bankTransfers: { where: { transferredAt: { not: null } }, select: { bankAccountId: true } },
    },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const jars = await prisma.jar.findMany();
  const lockedBankIds = new Set<number>(existing.bankTransfers.map((t) => t.bankAccountId));
  const existingAllocByJar = new Map(existing.allocations.map((a) => [a.jarId, a]));
  // Effective bank of a jar = saved per-month override ?? jar default
  const effectiveBankId = (jar: { id: number; bankAccountId: number | null }) =>
    existingAllocByJar.get(jar.id)?.bankAccountId ?? jar.bankAccountId;
  const isJarLocked = (jar: { id: number; bankAccountId: number | null }) => {
    const bankId = effectiveBankId(jar);
    return bankId != null && lockedBankIds.has(bankId);
  };
  const necJar = jars.find((j) => j.isNec);
  const necLocked = necJar ? isJarLocked(necJar) : false;

  const updatedRecord = await prisma.monthlyRecord.update({
    where: { year_month: { year, month } },
    // NEC bank already transferred → keep saved NEC amount untouched
    data: necLocked ? {} : { necAmount, necIsManual },
  });
  const effectiveNecAmount = necLocked ? existing.necAmount : necAmount;

  // Replace all monthly incomes
  if (Array.isArray(incomes)) {
    await db.monthlyIncome.deleteMany({ where: { monthlyRecordId: updatedRecord.id } });
    for (const i of incomes) {
      if (!i.incomeTypeId) continue;
      await db.monthlyIncome.create({
        data: {
          monthlyRecordId: updatedRecord.id,
          incomeTypeId: parseInt(i.incomeTypeId),
          amount: parseFloat(i.amount) || 0,
        },
      });
    }
  }

  // Replace all monthly deductions
  if (Array.isArray(deductions)) {
    await prisma.monthlyDeduction.deleteMany({ where: { monthlyRecordId: updatedRecord.id } });
    for (const d of deductions) {
      if (!d.deductionTypeId) continue;
      await prisma.monthlyDeduction.create({
        data: {
          monthlyRecordId: updatedRecord.id,
          deductionTypeId: parseInt(d.deductionTypeId),
          amount: parseFloat(d.amount) || 0,
        },
      });
    }
  }

  const pctOverrides: Record<number, number> = {};
  if (jarPercentages) {
    for (const [idStr, pct] of Object.entries(jarPercentages)) {
      pctOverrides[parseInt(idStr)] = pct as number;
    }
  }

  const bankOverrides: Record<number, number | null> = {};
  const bankOverridesProvided = jarBankAccounts && typeof jarBankAccounts === "object";
  if (bankOverridesProvided) {
    for (const [idStr, accId] of Object.entries(jarBankAccounts as Record<string, unknown>)) {
      bankOverrides[parseInt(idStr)] = accId === null || accId === undefined ? null : Number(accId);
    }
  }

  const allocations = calculateJarAllocations(netIncome, effectiveNecAmount, jars, pctOverrides);
  const jarById = new Map(jars.map((j) => [j.id, j]));
  for (const alloc of allocations) {
    // Jar whose target bank is already transferred is locked — keep its saved row intact
    const jar = jarById.get(alloc.jarId);
    if (jar && isJarLocked(jar)) continue;
    const bankOverride = bankOverridesProvided
      ? (alloc.jarId in bankOverrides ? bankOverrides[alloc.jarId] : null)
      : undefined;
    await prisma.jarAllocation.upsert({
      where: { monthlyRecordId_jarId: { monthlyRecordId: updatedRecord.id, jarId: alloc.jarId } },
      create: {
        monthlyRecordId: updatedRecord.id,
        jarId: alloc.jarId,
        amount: alloc.amount,
        percentage: alloc.percentage,
        bankAccountId: bankOverride ?? null,
      },
      update: {
        amount: alloc.amount,
        percentage: alloc.percentage,
        ...(bankOverride !== undefined ? { bankAccountId: bankOverride } : {}),
      },
    });
  }

  return NextResponse.json(updatedRecord);
}

export async function DELETE(
  _req: Request,
  { params }: { params: { yearMonth: string } }
) {
  const { year, month } = parseYearMonth(params.yearMonth);
  await prisma.monthlyRecord.delete({ where: { year_month: { year, month } } });
  return NextResponse.json({ ok: true });
}

export async function PUT(
  request: Request,
  { params }: { params: { yearMonth: string } }
) {
  const { year, month } = parseYearMonth(params.yearMonth);
  const { newYear, newMonth } = await request.json();

  if (!newYear || !newMonth) {
    return NextResponse.json({ error: "newYear and newMonth are required" }, { status: 400 });
  }

  const conflict = await prisma.monthlyRecord.findUnique({
    where: { year_month: { year: newYear, month: newMonth } },
  });
  if (conflict) {
    return NextResponse.json({ error: "เดือนนั้นมีข้อมูลอยู่แล้ว" }, { status: 400 });
  }

  const updated = await prisma.monthlyRecord.update({
    where: { year_month: { year, month } },
    data: { year: newYear, month: newMonth },
  });

  return NextResponse.json(updated);
}
