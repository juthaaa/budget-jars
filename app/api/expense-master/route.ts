import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { currentUserId, unauthorized } from "@/lib/auth";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

export async function GET() {
  const userId = await currentUserId();
  if (userId === null) return unauthorized();

  const items = await db.expenseMaster.findMany({
    where: { userId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return NextResponse.json(items);
}

export async function POST(request: Request) {
  const userId = await currentUserId();
  if (userId === null) return unauthorized();

  const { name, defaultJarCode } = await request.json();
  const item = await db.expenseMaster.create({
    data: {
      userId,
      name,
      defaultJarCode: defaultJarCode || null,
    },
  });
  return NextResponse.json(item, { status: 201 });
}
