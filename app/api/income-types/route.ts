import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { currentUserId, unauthorized } from "@/lib/auth";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

export async function GET() {
  const userId = await currentUserId();
  if (userId === null) return unauthorized();

  const types = await db.incomeType.findMany({
    where: { userId },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });
  return NextResponse.json(types);
}

export async function POST(request: Request) {
  const userId = await currentUserId();
  if (userId === null) return unauthorized();

  const { name, code, excludeFromNet, sortOrder } = await request.json();
  const type = await db.incomeType.create({
    data: {
      userId,
      name,
      code: code.toUpperCase(),
      excludeFromNet: excludeFromNet ?? false,
      sortOrder: sortOrder ?? 99,
    },
  });
  return NextResponse.json(type, { status: 201 });
}
