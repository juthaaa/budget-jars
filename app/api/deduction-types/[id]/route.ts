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
  const type = await scopedWrite(() =>
    prisma.deductionType.update({
      where: { id: parseInt(params.id), userId },
      data: {
        name: body.name,
        code: body.code,
        sortOrder: body.sortOrder !== undefined ? parseInt(body.sortOrder) : undefined,
      },
    })
  );
  if (!type) return notFound();
  return NextResponse.json(type);
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const userId = await currentUserId();
  if (userId === null) return unauthorized();

  const deleted = await scopedWrite(() =>
    prisma.deductionType.delete({ where: { id: parseInt(params.id), userId } })
  );
  if (!deleted) return notFound();
  return NextResponse.json({ ok: true });
}
