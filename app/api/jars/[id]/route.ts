import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const body = await request.json();
  const jar = await prisma.jar.update({
    where: { id: parseInt(params.id) },
    data: {
      name: body.name,
      jarType: body.jarType,
      bankAccountId: body.bankAccountId || null,
      percentage: parseFloat(body.percentage) || 0,
      rules: body.rules || null,
      isNec: body.isNec,
      sortOrder: body.sortOrder,
    },
    include: { bankAccount: true },
  });
  return NextResponse.json(jar);
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  await prisma.jar.delete({ where: { id: parseInt(params.id) } });
  return NextResponse.json({ ok: true });
}
