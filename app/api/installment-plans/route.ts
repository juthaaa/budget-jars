import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { badReference, currentUserId, unauthorized } from "@/lib/auth";
import { owns } from "@/lib/ownership";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

const ALLOWED_UNITS = new Set(["month", "year"]);

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
      i === n - 1
        ? Math.round((principal - base * i) * 100) / 100
        : base
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

export async function GET() {
  const userId = await currentUserId();
  if (userId === null) return unauthorized();

  const plans = await db.installmentPlan.findMany({
    where: { userId },
    include: {
      paymentMethod: { select: { id: true, name: true } },
      items: {
        include: { _count: { select: { expenses: true } } },
        orderBy: { installmentNumber: "asc" },
      },
    },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });
  return NextResponse.json(plans);
}

export async function POST(request: Request) {
  const userId = await currentUserId();
  if (userId === null) return unauthorized();

  const body = await request.json();
  const {
    name, jarCode, principalAmount, totalInstallments,
    interestRate, interestUnit, paymentMethodId, startDate, note,
  } = body;

  if (!name || !String(name).trim())
    return NextResponse.json({ error: "name required" }, { status: 400 });
  if (!principalAmount || parseFloat(principalAmount) <= 0)
    return NextResponse.json({ error: "principalAmount must be > 0" }, { status: 400 });
  if (!totalInstallments || parseInt(totalInstallments) < 1)
    return NextResponse.json({ error: "totalInstallments must be >= 1" }, { status: 400 });
  if (!startDate)
    return NextResponse.json({ error: "startDate required" }, { status: 400 });

  const pmIdNorm: number | null = paymentMethodId ?? null;
  if (!(await owns(userId, "paymentMethod", pmIdNorm))) return badReference();

  const unit: "month" | "year" = ALLOWED_UNITS.has(interestUnit) ? interestUnit : "month";
  const rate = parseFloat(interestRate) || 0;
  const n = parseInt(totalInstallments);
  const principal = parseFloat(principalAmount);

  const amounts = calcInstallmentAmounts(principal, n, rate, unit);

  const startDateParsed = new Date(startDate);
  const startYear = startDateParsed.getUTCFullYear();
  const startMonth = startDateParsed.getUTCMonth();

  const plan = await db.$transaction(async (tx: typeof db) => {
    const created = await tx.installmentPlan.create({
      data: {
        userId,
        name: String(name).trim(),
        jarCode: jarCode || "NEC",
        principalAmount: principal,
        totalInstallments: n,
        interestRate: rate,
        interestUnit: unit,
        paymentMethodId: pmIdNorm,
        startDate: new Date(Date.UTC(startYear, startMonth, 1)),
        note: note ?? null,
        sortOrder: 0,
      },
    });

    for (let i = 0; i < n; i++) {
      const monthDate = new Date(Date.UTC(startYear, startMonth + i, 1));
      await tx.recurringExpense.create({
        data: {
          userId,
          name: created.name,
          jarCode: created.jarCode,
          amount: amounts[i],
          startDate: monthDate,
          endDate: monthDate,
          paymentMethodId: pmIdNorm,
          sortOrder: 0,
          intervalValue: 1,
          intervalUnit: "month",
          installmentPlanId: created.id,
          installmentNumber: i + 1,
        },
      });
    }

    return tx.installmentPlan.findUnique({
      where: { id: created.id },
      include: {
        paymentMethod: { select: { id: true, name: true } },
        items: { orderBy: { installmentNumber: "asc" } },
      },
    });
  });

  return NextResponse.json(plan, { status: 201 });
}
