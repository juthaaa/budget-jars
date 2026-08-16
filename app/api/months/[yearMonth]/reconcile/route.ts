import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { currentUserId, notFound, scopedWrite, unauthorized } from "@/lib/auth";

function parseYearMonth(ym: string) {
  const [y, m] = ym.split("-");
  return { year: parseInt(y), month: parseInt(m) };
}

export async function POST(
  request: Request,
  { params }: { params: { yearMonth: string } }
) {
  const userId = await currentUserId();
  if (userId === null) return unauthorized();

  const { year, month } = parseYearMonth(params.yearMonth);
  const { reconciled } = await request.json();

  const updated = await scopedWrite(() =>
    prisma.monthlyRecord.update({
      where: { userId_year_month: { userId, year, month } },
      data: { reconciled: Boolean(reconciled) },
      select: { id: true, year: true, month: true, reconciled: true },
    })
  );
  if (!updated) return notFound();

  return NextResponse.json(updated);
}
