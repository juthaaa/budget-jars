import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { badReference, currentUserId, notFound, scopedWrite, unauthorized } from "@/lib/auth";
import { owns } from "@/lib/ownership";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  const userId = await currentUserId();
  if (userId === null) return unauthorized();

  const body = await request.json();
  const data: Record<string, unknown> = {};
  if ("name" in body) data.name = body.name;
  if ("code" in body) data.code = body.code;
  if ("sortOrder" in body) data.sortOrder = body.sortOrder ?? 0;
  if ("bankAccountId" in body) {
    const bankAccountId = body.bankAccountId === null || body.bankAccountId === undefined
      ? null
      : Number(body.bankAccountId);
    if (!(await owns(userId, "bankAccount", bankAccountId))) return badReference();
    data.bankAccountId = bankAccountId;
  }
  const updated = await scopedWrite(() =>
    db.paymentMethod.update({
      where: { id: parseInt(params.id), userId },
      data,
    })
  );
  if (!updated) return notFound();
  return NextResponse.json(updated);
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const userId = await currentUserId();
  if (userId === null) return unauthorized();

  const deleted = await scopedWrite(() =>
    db.paymentMethod.delete({ where: { id: parseInt(params.id), userId } })
  );
  if (!deleted) return notFound();
  return NextResponse.json({ ok: true });
}
