import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

function parseYearMonth(ym: string) {
  const [y, m] = ym.split("-");
  return { year: parseInt(y), month: parseInt(m) };
}

export async function POST(
  request: Request,
  { params }: { params: { yearMonth: string } }
) {
  const { year, month } = parseYearMonth(params.yearMonth);
  const { reconciled } = await request.json();

  const updated = await prisma.monthlyRecord.update({
    where: { year_month: { year, month } },
    data: { reconciled: Boolean(reconciled) },
    select: { id: true, year: true, month: true, reconciled: true },
  });

  return NextResponse.json(updated);
}
