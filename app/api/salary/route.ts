import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const records = await prisma.salaryHistory.findMany({
    orderBy: { effectiveDate: "asc" },
  });
  return NextResponse.json(records);
}

export async function POST(request: Request) {
  const body = await request.json();
  const record = await prisma.salaryHistory.create({
    data: {
      effectiveDate: new Date(body.effectiveDate),
      amount: parseFloat(body.amount),
    },
  });
  return NextResponse.json(record, { status: 201 });
}
