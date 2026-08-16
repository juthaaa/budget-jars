import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { currentUserId, unauthorized } from "@/lib/auth";

export async function GET() {
  const userId = await currentUserId();
  if (userId === null) return unauthorized();

  const accounts = await prisma.bankAccount.findMany({
    where: { userId },
    orderBy: { id: "asc" },
  });
  return NextResponse.json(accounts);
}

export async function POST(request: Request) {
  const userId = await currentUserId();
  if (userId === null) return unauthorized();

  const body = await request.json();
  const account = await prisma.bankAccount.create({
    data: {
      userId,
      name: body.name,
      accountNumber: body.accountNumber || null,
      color: body.color || "#6366f1",
    },
  });
  return NextResponse.json(account, { status: 201 });
}
