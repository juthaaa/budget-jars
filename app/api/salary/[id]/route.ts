import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const body = await request.json();
  const record = await prisma.salaryHistory.update({
    where: { id: parseInt(params.id) },
    data: {
      effectiveDate: new Date(body.effectiveDate),
      amount: parseFloat(body.amount),
    },
  });
  return NextResponse.json(record);
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  await prisma.salaryHistory.delete({ where: { id: parseInt(params.id) } });
  return NextResponse.json({ ok: true });
}
