import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

function parseYearMonth(ym: string) {
  const [y, m] = ym.split("-");
  return { year: parseInt(y), month: parseInt(m) };
}

export async function PATCH(
  request: Request,
  { params }: { params: { yearMonth: string } },
) {
  const { year, month } = parseYearMonth(params.yearMonth);
  const body = await request.json();

  const record = await prisma.monthlyRecord.findUnique({
    where: { year_month: { year, month } },
    select: { id: true },
  });
  if (!record) return NextResponse.json({ error: "Month not found" }, { status: 404 });

  const bankAccountId: number | null =
    body.bankAccountId === null || body.bankAccountId === undefined
      ? null
      : Number(body.bankAccountId);

  const updated = await prisma.monthlyRecord.update({
    where: { id: record.id },
    data: { unassignedBankAccountId: bankAccountId },
  });

  return NextResponse.json(updated);
}
