import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { currentUserId, unauthorized } from "@/lib/auth";

export async function GET() {
  const userId = await currentUserId();
  if (userId === null) return unauthorized();

  const types = await prisma.deductionType.findMany({
    where: { userId },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    include: { rules: { orderBy: { effectiveDate: "desc" } } },
  });
  return NextResponse.json(types);
}

export async function POST(request: Request) {
  const userId = await currentUserId();
  if (userId === null) return unauthorized();

  const body = await request.json();
  const type = await prisma.deductionType.create({
    data: {
      userId,
      name: body.name,
      code: body.code,
      sortOrder: body.sortOrder ? parseInt(body.sortOrder) : 99,
    },
  });
  return NextResponse.json(type, { status: 201 });
}
