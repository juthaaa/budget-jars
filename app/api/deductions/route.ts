import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const rules = await prisma.deductionRule.findMany({
    orderBy: [{ deductionTypeId: "asc" }, { effectiveDate: "desc" }],
    include: { deductionType: true },
  });
  return NextResponse.json(rules);
}

export async function POST(request: Request) {
  const body = await request.json();
  const rule = await prisma.deductionRule.create({
    data: {
      deductionTypeId: parseInt(body.deductionTypeId),
      valueType: body.valueType,
      value: parseFloat(body.value),
      effectiveDate: new Date(body.effectiveDate),
    },
  });
  return NextResponse.json(rule, { status: 201 });
}
