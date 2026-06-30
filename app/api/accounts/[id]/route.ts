import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const body = await request.json();
  const account = await prisma.bankAccount.update({
    where: { id: parseInt(params.id) },
    data: {
      name: body.name,
      accountNumber: body.accountNumber || null,
      color: body.color || "#6366f1",
    },
  });
  return NextResponse.json(account);
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const id = parseInt(params.id);
  const jarsUsing = await prisma.jar.count({ where: { bankAccountId: id } });
  if (jarsUsing > 0) {
    return NextResponse.json(
      { error: `ไม่สามารถลบได้ มี ${jarsUsing} jar ที่ใช้บัญชีนี้อยู่` },
      { status: 400 }
    );
  }
  await prisma.bankAccount.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
