import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

export async function GET() {
  const methods = await db.paymentMethod.findMany({
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });
  return NextResponse.json(methods);
}

export async function POST(request: Request) {
  const body = await request.json();
  if (!body.name || !body.code) {
    return NextResponse.json({ error: "name และ code จำเป็น" }, { status: 400 });
  }
  const created = await db.paymentMethod.create({
    data: {
      name: body.name,
      code: body.code,
      bankAccountId: body.bankAccountId ?? null,
      sortOrder: body.sortOrder ?? 0,
    },
  });
  return NextResponse.json(created);
}
