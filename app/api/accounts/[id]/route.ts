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
  const account = await scopedWrite(() =>
    prisma.bankAccount.update({
      where: { id: parseInt(params.id), userId },
      data: {
        name: body.name,
        accountNumber: body.accountNumber || null,
        color: body.color || "#6366f1",
      },
    })
  );
  if (!account) return notFound();
  return NextResponse.json(account);
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const userId = await currentUserId();
  if (userId === null) return unauthorized();

  const id = parseInt(params.id);
  const jarsUsing = await prisma.jar.count({ where: { bankAccountId: id, userId } });
  if (jarsUsing > 0) {
    return NextResponse.json(
      { error: `ไม่สามารถลบได้ มี ${jarsUsing} jar ที่ใช้บัญชีนี้อยู่` },
      { status: 400 }
    );
  }
  const deleted = await scopedWrite(() =>
    prisma.bankAccount.delete({ where: { id, userId } })
  );
  if (!deleted) return notFound();
  return NextResponse.json({ ok: true });
}
