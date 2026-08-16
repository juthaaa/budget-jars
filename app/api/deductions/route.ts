import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { badReference, currentUserId, unauthorized } from "@/lib/auth";
import { owns } from "@/lib/ownership";

export async function GET() {
  const userId = await currentUserId();
  if (userId === null) return unauthorized();

  const rules = await prisma.deductionRule.findMany({
    where: { userId },
    orderBy: [{ deductionTypeId: "asc" }, { effectiveDate: "desc" }],
    include: { deductionType: true },
  });
  return NextResponse.json(rules);
}

export async function POST(request: Request) {
  const userId = await currentUserId();
  if (userId === null) return unauthorized();

  const body = await request.json();
  const deductionTypeId = parseInt(body.deductionTypeId);
  if (!(await owns(userId, "deductionType", deductionTypeId))) return badReference();

  const rule = await prisma.deductionRule.create({
    data: {
      userId,
      deductionTypeId,
      valueType: body.valueType,
      value: parseFloat(body.value),
      effectiveDate: new Date(body.effectiveDate),
    },
  });
  return NextResponse.json(rule, { status: 201 });
}
