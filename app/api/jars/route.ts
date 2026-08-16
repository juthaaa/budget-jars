import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { badReference, currentUserId, unauthorized } from "@/lib/auth";
import { owns } from "@/lib/ownership";

export async function GET() {
  const userId = await currentUserId();
  if (userId === null) return unauthorized();

  const jars = await prisma.jar.findMany({
    where: { userId },
    orderBy: { sortOrder: "asc" },
    include: { bankAccount: true },
  });
  return NextResponse.json(jars);
}

export async function POST(request: Request) {
  const userId = await currentUserId();
  if (userId === null) return unauthorized();

  const body = await request.json();
  const bankAccountId = body.bankAccountId || null;
  if (!(await owns(userId, "bankAccount", bankAccountId))) return badReference();

  const jar = await prisma.jar.create({
    data: {
      userId,
      name: body.name,
      code: body.code.toUpperCase(),
      jarType: body.jarType || "a",
      bankAccountId,
      percentage: parseFloat(body.percentage) || 0,
      rules: body.rules || null,
      isNec: body.isNec || false,
      sortOrder: body.sortOrder || 99,
    },
    include: { bankAccount: true },
  });
  return NextResponse.json(jar, { status: 201 });
}
