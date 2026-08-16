import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { currentUserId, notFound, scopedWrite, unauthorized } from "@/lib/auth";

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const userId = await currentUserId();
  if (userId === null) return unauthorized();

  const body = await request.json();
  const record = await scopedWrite(() =>
    prisma.salaryHistory.update({
      where: { id: parseInt(params.id), userId },
      data: {
        effectiveDate: new Date(body.effectiveDate),
        amount: parseFloat(body.amount),
      },
    })
  );
  if (!record) return notFound();
  return NextResponse.json(record);
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const userId = await currentUserId();
  if (userId === null) return unauthorized();

  const deleted = await scopedWrite(() =>
    prisma.salaryHistory.delete({ where: { id: parseInt(params.id), userId } })
  );
  if (!deleted) return notFound();
  return NextResponse.json({ ok: true });
}
