import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const accounts = await prisma.bankAccount.findMany({ orderBy: { id: "asc" } });
  return NextResponse.json(accounts);
}

export async function POST(request: Request) {
  const body = await request.json();
  const account = await prisma.bankAccount.create({
    data: {
      name: body.name,
      accountNumber: body.accountNumber || null,
      color: body.color || "#6366f1",
    },
  });
  return NextResponse.json(account, { status: 201 });
}
