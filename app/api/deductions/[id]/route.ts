import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const body = await request.json();
  const rule = await prisma.deductionRule.update({
    where: { id: parseInt(params.id) },
    data: {
      deductionTypeId: body.deductionTypeId !== undefined ? parseInt(body.deductionTypeId) : undefined,
      valueType: body.valueType,
      value: parseFloat(body.value),
      effectiveDate: new Date(body.effectiveDate),
    },
  });
  return NextResponse.json(rule);
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  await prisma.deductionRule.delete({ where: { id: parseInt(params.id) } });
  return NextResponse.json({ ok: true });
}
