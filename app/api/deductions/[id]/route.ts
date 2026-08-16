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
  const deductionTypeId =
    body.deductionTypeId !== undefined ? parseInt(body.deductionTypeId) : undefined;
  if (!(await owns(userId, "deductionType", deductionTypeId))) return badReference();

  const rule = await scopedWrite(() =>
    prisma.deductionRule.update({
      where: { id: parseInt(params.id), userId },
      data: {
        deductionTypeId,
        valueType: body.valueType,
        value: parseFloat(body.value),
        effectiveDate: new Date(body.effectiveDate),
      },
    })
  );
  if (!rule) return notFound();
  return NextResponse.json(rule);
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const userId = await currentUserId();
  if (userId === null) return unauthorized();

  const deleted = await scopedWrite(() =>
    prisma.deductionRule.delete({ where: { id: parseInt(params.id), userId } })
  );
  if (!deleted) return notFound();
  return NextResponse.json({ ok: true });
}
