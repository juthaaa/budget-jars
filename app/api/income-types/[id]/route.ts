import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { currentUserId, notFound, scopedWrite, unauthorized } from "@/lib/auth";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const userId = await currentUserId();
  if (userId === null) return unauthorized();

  const id = parseInt(params.id);
  const { name, code, excludeFromNet, sortOrder } = await request.json();

  const updated = await scopedWrite(() =>
    db.incomeType.update({
      where: { id, userId },
      data: {
        ...(name !== undefined && { name }),
        ...(code !== undefined && { code: code.toUpperCase() }),
        ...(excludeFromNet !== undefined && { excludeFromNet }),
        ...(sortOrder !== undefined && { sortOrder }),
      },
    })
  );
  if (!updated) return notFound();
  return NextResponse.json(updated);
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const userId = await currentUserId();
  if (userId === null) return unauthorized();

  const deleted = await scopedWrite(() =>
    db.incomeType.delete({ where: { id: parseInt(params.id), userId } })
  );
  if (!deleted) return notFound();
  return NextResponse.json({ ok: true });
}
