import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

export async function GET() {
  const items = await db.expenseMaster.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return NextResponse.json(items);
}

export async function POST(request: Request) {
  const { name, defaultJarCode } = await request.json();
  const item = await db.expenseMaster.create({
    data: {
      name,
      defaultJarCode: defaultJarCode || null,
    },
  });
  return NextResponse.json(item, { status: 201 });
}
