import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const id = parseInt(params.id);
  const { name, defaultJarCode } = await request.json();
  const item = await db.expenseMaster.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(defaultJarCode !== undefined && { defaultJarCode: defaultJarCode || null }),
    },
  });
  return NextResponse.json(item);
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  await db.expenseMaster.delete({ where: { id: parseInt(params.id) } });
  return NextResponse.json({ ok: true });
}
