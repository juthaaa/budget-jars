import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const jars = await prisma.jar.findMany({
    orderBy: { sortOrder: "asc" },
    include: { bankAccount: true },
  });
  return NextResponse.json(jars);
}

export async function POST(request: Request) {
  const body = await request.json();
  const jar = await prisma.jar.create({
    data: {
      name: body.name,
      code: body.code.toUpperCase(),
      jarType: body.jarType || "a",
      bankAccountId: body.bankAccountId || null,
      percentage: parseFloat(body.percentage) || 0,
      rules: body.rules || null,
      isNec: body.isNec || false,
      sortOrder: body.sortOrder || 99,
    },
    include: { bankAccount: true },
  });
  return NextResponse.json(jar, { status: 201 });
}
