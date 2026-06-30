import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const id = parseInt(params.id);
  const { name, code, excludeFromNet, sortOrder } = await request.json();

  const updated = await db.incomeType.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(code !== undefined && { code: code.toUpperCase() }),
      ...(excludeFromNet !== undefined && { excludeFromNet }),
      ...(sortOrder !== undefined && { sortOrder }),
    },
  });
  return NextResponse.json(updated);
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const id = parseInt(params.id);
  await db.incomeType.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
