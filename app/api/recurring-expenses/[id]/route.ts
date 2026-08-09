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

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const id = parseInt(params.id);
  const body = await request.json();
  const { name, jarCode, amount, startDate, endDate, paymentMethodId, sortOrder, intervalValue, intervalUnit, note } = body;

  if (intervalUnit !== undefined && !ALLOWED_UNITS.has(intervalUnit)) {
    return NextResponse.json({ error: "intervalUnit must be 'month' or 'year'" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (name !== undefined) data.name = String(name).trim();
  if (jarCode !== undefined) data.jarCode = jarCode || "NEC";
  if (amount !== undefined) data.amount = parseFloat(amount) || 0;
  if (startDate !== undefined) data.startDate = parseDate(startDate);
  if (endDate !== undefined) data.endDate = parseDate(endDate);
  if (paymentMethodId !== undefined) data.paymentMethodId = paymentMethodId ?? null;
  if (sortOrder !== undefined) data.sortOrder = Number(sortOrder) || 0;
  if (intervalValue !== undefined) data.intervalValue = parseInt(intervalValue) || 1;
  if (intervalUnit !== undefined) data.intervalUnit = intervalUnit;
  if (note !== undefined) data.note = note ?? null;

  const item = await db.recurringExpense.update({
    where: { id },
    data,
    include: { paymentMethod: { select: { id: true, name: true } } },
  });
  return NextResponse.json(item);
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  await db.recurringExpense.delete({ where: { id: parseInt(params.id) } });
  return NextResponse.json({ ok: true });
}
