import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  const body = await request.json();
  const data: Record<string, unknown> = {};
  if ("name" in body) data.name = body.name;
  if ("code" in body) data.code = body.code;
  if ("sortOrder" in body) data.sortOrder = body.sortOrder ?? 0;
  if ("bankAccountId" in body) {
    data.bankAccountId = body.bankAccountId === null || body.bankAccountId === undefined
      ? null
      : Number(body.bankAccountId);
  }
  const updated = await db.paymentMethod.update({
    where: { id: parseInt(params.id) },
    data,
  });
  return NextResponse.json(updated);
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  await db.paymentMethod.delete({ where: { id: parseInt(params.id) } });
  return NextResponse.json({ ok: true });
}
