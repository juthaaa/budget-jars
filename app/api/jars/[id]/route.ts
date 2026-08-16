import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { badReference, currentUserId, notFound, scopedWrite, unauthorized } from "@/lib/auth";
import { owns } from "@/lib/ownership";

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const userId = await currentUserId();
  if (userId === null) return unauthorized();

  const body = await request.json();
  const bankAccountId = body.bankAccountId || null;
  if (!(await owns(userId, "bankAccount", bankAccountId))) return badReference();

  const jar = await scopedWrite(() =>
    prisma.jar.update({
      where: { id: parseInt(params.id), userId },
      data: {
        name: body.name,
        jarType: body.jarType,
        bankAccountId,
        percentage: parseFloat(body.percentage) || 0,
        rules: body.rules || null,
        isNec: body.isNec,
        sortOrder: body.sortOrder,
      },
      include: { bankAccount: true },
    })
  );
  if (!jar) return notFound();
  return NextResponse.json(jar);
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const userId = await currentUserId();
  if (userId === null) return unauthorized();

  const deleted = await scopedWrite(() =>
    prisma.jar.delete({ where: { id: parseInt(params.id), userId } })
  );
  if (!deleted) return notFound();
  return NextResponse.json({ ok: true });
}
