import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { badReference, currentUserId, unauthorized } from "@/lib/auth";
import { owns } from "@/lib/ownership";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

function parseYearMonth(ym: string) {
  const [y, m] = ym.split("-");
  return { year: parseInt(y), month: parseInt(m) };
}

export async function PATCH(
  request: Request,
  { params }: { params: { yearMonth: string; paymentMethodId: string } },
) {
  const userId = await currentUserId();
  if (userId === null) return unauthorized();

  const { year, month } = parseYearMonth(params.yearMonth);
  const paymentMethodId = parseInt(params.paymentMethodId);
  const body = await request.json();

  const record = await prisma.monthlyRecord.findUnique({
    where: { userId_year_month: { userId, year, month } },
    select: { id: true },
  });
  if (!record) return NextResponse.json({ error: "Month not found" }, { status: 404 });
  if (!(await owns(userId, "paymentMethod", paymentMethodId))) return badReference();

  const current = await db.monthlyPaymentSettlement.findUnique({
    where: { monthlyRecordId_paymentMethodId: { monthlyRecordId: record.id, paymentMethodId } },
  });

  const nextPaidAt: Date | null = "paidAt" in body
    ? (body.paidAt ? new Date(body.paidAt) : null)
    : (current?.paidAt ?? null);
  const nextReconciledAt: Date | null = "reconciledAt" in body
    ? (body.reconciledAt ? new Date(body.reconciledAt) : null)
    : (current?.reconciledAt ?? null);

  if (nextPaidAt && !nextReconciledAt) {
    return NextResponse.json(
      { error: "ต้องตรวจสอบก่อนถึงจะตั้งเป็นจ่ายแล้วได้" },
      { status: 400 },
    );
  }

  const upserted = await db.monthlyPaymentSettlement.upsert({
    where: { monthlyRecordId_paymentMethodId: { monthlyRecordId: record.id, paymentMethodId } },
    update: { paidAt: nextPaidAt, reconciledAt: nextReconciledAt },
    create: {
      userId,
      monthlyRecordId: record.id,
      paymentMethodId,
      paidAt: nextPaidAt,
      reconciledAt: nextReconciledAt,
    },
  });

  return NextResponse.json(upserted);
}
