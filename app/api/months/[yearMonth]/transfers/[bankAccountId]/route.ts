import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

function parseYearMonth(ym: string) {
  const [y, m] = ym.split("-");
  return { year: parseInt(y), month: parseInt(m) };
}

export async function PATCH(
  request: Request,
  { params }: { params: { yearMonth: string; bankAccountId: string } },
) {
  const { year, month } = parseYearMonth(params.yearMonth);
  const bankAccountId = parseInt(params.bankAccountId);
  const body = await request.json();

  const record = await prisma.monthlyRecord.findUnique({
    where: { year_month: { year, month } },
    select: { id: true },
  });
  if (!record) return NextResponse.json({ error: "Month not found" }, { status: 404 });

  const transferredAt: Date | null = body.transferredAt
    ? new Date(body.transferredAt)
    : null;

  const upserted = await db.monthlyBankTransfer.upsert({
    where: { monthlyRecordId_bankAccountId: { monthlyRecordId: record.id, bankAccountId } },
    update: { transferredAt },
    create: {
      monthlyRecordId: record.id,
      bankAccountId,
      transferredAt,
    },
  });

  return NextResponse.json(upserted);
}
