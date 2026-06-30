import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const types = await prisma.deductionType.findMany({
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    include: { rules: { orderBy: { effectiveDate: "desc" } } },
  });
  return NextResponse.json(types);
}

export async function POST(request: Request) {
  const body = await request.json();
  const type = await prisma.deductionType.create({
    data: {
      name: body.name,
      code: body.code,
      sortOrder: body.sortOrder ? parseInt(body.sortOrder) : 99,
    },
  });
  return NextResponse.json(type, { status: 201 });
}
