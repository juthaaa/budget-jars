import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const body = await request.json();
  const type = await prisma.deductionType.update({
    where: { id: parseInt(params.id) },
    data: {
      name: body.name,
      code: body.code,
      sortOrder: body.sortOrder !== undefined ? parseInt(body.sortOrder) : undefined,
    },
  });
  return NextResponse.json(type);
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  await prisma.deductionType.delete({ where: { id: parseInt(params.id) } });
  return NextResponse.json({ ok: true });
}
