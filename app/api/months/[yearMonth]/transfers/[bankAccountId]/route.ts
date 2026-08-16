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
  { params }: { params: { yearMonth: string; bankAccountId: string } },
) {
  const userId = await currentUserId();
  if (userId === null) return unauthorized();

  const { year, month } = parseYearMonth(params.yearMonth);
  const bankAccountId = parseInt(params.bankAccountId);
  const body = await request.json();

  const record = await prisma.monthlyRecord.findUnique({
    where: { userId_year_month: { userId, year, month } },
    select: { id: true },
  });
  if (!record) return NextResponse.json({ error: "Month not found" }, { status: 404 });
  if (!(await owns(userId, "bankAccount", bankAccountId))) return badReference();

  const transferredAt: Date | null = body.transferredAt
    ? new Date(body.transferredAt)
    : null;

  const upserted = await db.monthlyBankTransfer.upsert({
    where: { monthlyRecordId_bankAccountId: { monthlyRecordId: record.id, bankAccountId } },
    update: { transferredAt },
    create: {
      userId,
      monthlyRecordId: record.id,
      bankAccountId,
      transferredAt,
    },
  });

  return NextResponse.json(upserted);
}
