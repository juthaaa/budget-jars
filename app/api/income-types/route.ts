import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

export async function GET() {
  const types = await db.incomeType.findMany({
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });
  return NextResponse.json(types);
}

export async function POST(request: Request) {
  const { name, code, excludeFromNet, sortOrder } = await request.json();
  const type = await db.incomeType.create({
    data: {
      name,
      code: code.toUpperCase(),
      excludeFromNet: excludeFromNet ?? false,
      sortOrder: sortOrder ?? 99,
    },
  });
  return NextResponse.json(type, { status: 201 });
}
