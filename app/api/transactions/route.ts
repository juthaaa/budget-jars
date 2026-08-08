import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { resolveOccurredAt } from "@/lib/transaction-time";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const direction = searchParams.get("direction");
  const year = searchParams.get("year");
  const month = searchParams.get("month");

  const where: Prisma.TransactionWhereInput = {};
  if (status) where.status = status;
  if (direction) where.direction = direction;
  if (year) where.year = parseInt(year);
  if (month) where.month = parseInt(month);

  const transactions = await prisma.transaction.findMany({
    where,
    orderBy: { occurredAt: "desc" },
  });
  return NextResponse.json(transactions);
}

export async function POST(request: Request) {
  const body = await request.json();

  if (!body.name || typeof body.name !== "string") {
    return NextResponse.json({ error: "กรุณาระบุชื่อรายการ" }, { status: 400 });
  }
  if (body.direction !== "in" && body.direction !== "out") {
    return NextResponse.json({ error: "ประเภทรายการไม่ถูกต้อง" }, { status: 400 });
  }
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "จำนวนเงินต้องมากกว่า 0" }, { status: 400 });
  }
  if (!body.occurredAt) {
    return NextResponse.json({ error: "กรุณาระบุวันที่-เวลา" }, { status: 400 });
  }

  const { occurredAt, year, month } = resolveOccurredAt(body.occurredAt);
  const rawText = `[manual] ${body.direction === "out" ? "จ่าย" : "รับ"} ${body.name} ${amount}`;

  const created = await prisma.transaction.create({
    data: {
      source: "manual",
      rawText,
      status: "pending",
      direction: body.direction,
      name: body.name,
      amount,
      note: body.note || null,
      occurredAt,
      year,
      month,
    },
  });
  return NextResponse.json(created, { status: 201 });
}
