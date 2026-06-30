import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

const ALLOWED_UNITS = new Set(["month", "year"]);

function parseDate(value: unknown): Date | null {
  if (!value) return null;
  const d = new Date(String(value));
  return isNaN(d.getTime()) ? null : d;
}

export async function GET() {
  const items = await db.recurringExpense.findMany({
    where: { installmentPlanId: null },
    include: {
      expenseMaster: true,
      paymentMethod: { select: { id: true, name: true } },
    },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });
  return NextResponse.json(items);
}

export async function POST(request: Request) {
  const body = await request.json();
  const { expenseMasterId, amount, startDate, endDate, paymentMethodId, sortOrder, intervalValue, intervalUnit, note } = body;

  if (!expenseMasterId) {
    return NextResponse.json({ error: "expenseMasterId is required" }, { status: 400 });
  }
  const unit = intervalUnit ?? "month";
  if (!ALLOWED_UNITS.has(unit)) {
    return NextResponse.json({ error: "intervalUnit must be 'month' or 'year'" }, { status: 400 });
  }

  const item = await db.recurringExpense.create({
    data: {
      expenseMasterId: parseInt(expenseMasterId),
      amount: parseFloat(amount) || 0,
      startDate: parseDate(startDate),
      endDate: parseDate(endDate),
      paymentMethodId: paymentMethodId ?? null,
      sortOrder: sortOrder !== undefined ? Number(sortOrder) || 0 : 0,
      intervalValue: intervalValue !== undefined ? parseInt(intervalValue) || 1 : 1,
      intervalUnit: unit,
      note: note ?? null,
    },
    include: { expenseMaster: true, paymentMethod: { select: { id: true, name: true } } },
  });
  return NextResponse.json(item, { status: 201 });
}
