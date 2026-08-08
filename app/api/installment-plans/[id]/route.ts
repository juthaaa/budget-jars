import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

function calcInstallmentAmounts(
  principal: number,
  n: number,
  rate: number,
  rateUnit: "month" | "year"
): number[] {
  const monthlyRate = rateUnit === "year" ? rate / 12 / 100 : rate / 100;
  if (monthlyRate <= 0) {
    const base = Math.round((principal / n) * 100) / 100;
    return Array.from({ length: n }, (_, i) =>
      i === n - 1 ? Math.round((principal - base * i) * 100) / 100 : base
    );
  }
  const fixedPayment = (principal * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -n));
  const amounts: number[] = [];
  let balance = principal;
  for (let i = 0; i < n; i++) {
    const interest = Math.round(balance * monthlyRate * 100) / 100;
    if (i === n - 1) {
      amounts.push(Math.round((balance + interest) * 100) / 100);
      break;
    }
    const principalPaid = Math.round((fixedPayment - interest) * 100) / 100;
    amounts.push(Math.round((principalPaid + interest) * 100) / 100);
    balance = Math.round((balance - principalPaid) * 100) / 100;
  }
  return amounts;
}

type ChildRow = {
  id: number;
  installmentNumber: number | null;
  _count: { expenses: number };
};

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const id = parseInt(params.id);
  const body = await request.json();
  const {
    expenseMasterId,
    principalAmount,
    totalInstallments,
    interestRate,
    interestUnit,
    paymentMethodId,
    startDate,
    note,
  } = body;
  const pmIdNorm: number | null = paymentMethodId ?? null;

  const n = parseInt(totalInstallments);
  const principal = parseFloat(principalAmount);
  const rate = parseFloat(interestRate) || 0;
  const unit: "month" | "year" = interestUnit === "year" ? "year" : "month";

  const startDateParsed = new Date(startDate);
  const startYear = startDateParsed.getUTCFullYear();
  const startMonth = startDateParsed.getUTCMonth();

  const existing = await db.installmentPlan.findUnique({
    where: { id },
    include: {
      items: {
        include: { _count: { select: { expenses: true } } },
        orderBy: { installmentNumber: "asc" },
      },
    },
  });

  if (!existing) {
    return NextResponse.json({ error: "Plan not found" }, { status: 404 });
  }

  const maxSeeded = existing.items.reduce((max: number, child: ChildRow) =>
    child._count.expenses > 0 ? Math.max(max, child.installmentNumber ?? 0) : max
  , 0);

  if (n < maxSeeded) {
    return NextResponse.json(
      { error: `ไม่สามารถลดจำนวนงวดได้ต่ำกว่า ${maxSeeded} เพราะงวดที่ ${maxSeeded} ถูกดึงไปแล้ว` },
      { status: 400 }
    );
  }

  const newMasterId = parseInt(expenseMasterId);
  const masterChanged = newMasterId !== existing.expenseMasterId;

  // Expense Type is locked once any installment has been seeded — plan and its
  // items must always share the same expenseMasterId.
  if (masterChanged && maxSeeded > 0) {
    return NextResponse.json(
      { error: "ไม่สามารถเปลี่ยน Expense Type ได้ เพราะมีงวดที่ถูกดึงไปแล้ว" },
      { status: 400 }
    );
  }

  await db.installmentPlan.update({
    where: { id },
    data: {
      expenseMasterId: parseInt(expenseMasterId),
      principalAmount: principal,
      totalInstallments: n,
      interestRate: rate,
      interestUnit: unit,
      paymentMethodId: pmIdNorm,
      startDate: new Date(Date.UTC(startYear, startMonth, 1)),
      note: note ?? null,
    },
  });

  // Keep all existing items on the same Expense Type as the plan. Safe here
  // because a master change with any seeded item was rejected above.
  if (masterChanged) {
    await db.recurringExpense.updateMany({
      where: { installmentPlanId: id },
      data: { expenseMasterId: newMasterId },
    });
  }

  const amounts = calcInstallmentAmounts(principal, n, rate, unit);
  const childMap = new Map<number, ChildRow>(
    existing.items.map((c: ChildRow) => [c.installmentNumber ?? 0, c])
  );

  for (let i = 0; i < n; i++) {
    const num = i + 1;
    const installDate = new Date(Date.UTC(startYear, startMonth + i, 1));
    const child = childMap.get(num);

    if (child) {
      if (child._count.expenses > 0) continue; // already seeded → skip
      await db.recurringExpense.update({
        where: { id: child.id },
        data: { amount: amounts[i], startDate: installDate, endDate: installDate },
      });
    } else {
      await db.recurringExpense.create({
        data: {
          expenseMasterId: parseInt(expenseMasterId),
          amount: amounts[i],
          startDate: installDate,
          endDate: installDate,
          paymentMethodId: pmIdNorm,
          sortOrder: 0,
          intervalValue: 1,
          intervalUnit: "month",
          installmentPlanId: id,
          installmentNumber: num,
        },
      });
    }
  }

  // Delete unseeded children beyond new totalInstallments
  for (const child of existing.items as ChildRow[]) {
    if ((child.installmentNumber ?? 0) > n && child._count.expenses === 0) {
      await db.recurringExpense.delete({ where: { id: child.id } });
    }
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  await db.installmentPlan.delete({ where: { id: parseInt(params.id) } });
  return NextResponse.json({ ok: true });
}
