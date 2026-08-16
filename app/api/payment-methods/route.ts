import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { badReference, currentUserId, unauthorized } from "@/lib/auth";
import { owns } from "@/lib/ownership";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

export async function GET() {
  const userId = await currentUserId();
  if (userId === null) return unauthorized();

  const methods = await db.paymentMethod.findMany({
    where: { userId },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });
  return NextResponse.json(methods);
}

export async function POST(request: Request) {
  const userId = await currentUserId();
  if (userId === null) return unauthorized();

  const body = await request.json();
  if (!body.name || !body.code) {
    return NextResponse.json({ error: "name และ code จำเป็น" }, { status: 400 });
  }
  const bankAccountId = body.bankAccountId ?? null;
  if (!(await owns(userId, "bankAccount", bankAccountId))) return badReference();

  const created = await db.paymentMethod.create({
    data: {
      userId,
      name: body.name,
      code: body.code,
      bankAccountId,
      sortOrder: body.sortOrder ?? 0,
    },
  });
  return NextResponse.json(created);
}
