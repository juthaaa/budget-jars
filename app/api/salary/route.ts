import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { currentUserId, unauthorized } from "@/lib/auth";

export async function GET() {
  const userId = await currentUserId();
  if (userId === null) return unauthorized();

  const records = await prisma.salaryHistory.findMany({
    where: { userId },
    orderBy: { effectiveDate: "asc" },
  });
  return NextResponse.json(records);
}

export async function POST(request: Request) {
  const userId = await currentUserId();
  if (userId === null) return unauthorized();

  const body = await request.json();
  const record = await prisma.salaryHistory.create({
    data: {
      userId,
      effectiveDate: new Date(body.effectiveDate),
      amount: parseFloat(body.amount),
    },
  });
  return NextResponse.json(record, { status: 201 });
}
