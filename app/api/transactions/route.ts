import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { resolveOccurredAt } from "@/lib/transaction-time";
import { badReference, currentUserId, unauthorized } from "@/lib/auth";
import { owns } from "@/lib/ownership";

export async function GET(request: Request) {
  const userId = await currentUserId();
  if (userId === null) return unauthorized();

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const direction = searchParams.get("direction");
  const year = searchParams.get("year");
  const month = searchParams.get("month");
  const date = searchParams.get("date"); // YYYY-MM-DD, exact day (face-value, see transaction-time.ts)

  const where: Prisma.TransactionWhereInput = { userId };
  if (status) where.status = status;
  if (direction) where.direction = direction;
  if (year) where.year = parseInt(year);
  if (month) where.month = parseInt(month);
  if (date) {
    const [y, m, d] = date.split("-").map(Number);
    where.occurredAt = {
      gte: new Date(Date.UTC(y, m - 1, d, 0, 0, 0)),
      lte: new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999)),
    };
  }

  const transactions = await prisma.transaction.findMany({
    where,
    orderBy: { occurredAt: "desc" },
  });
  return NextResponse.json(transactions);
}

export async function POST(request: Request) {
  const userId = await currentUserId();
  if (userId === null) return unauthorized();

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

  const paymentMethodId = body.paymentMethodId ? Number(body.paymentMethodId) : null;
  if (!(await owns(userId, "paymentMethod", paymentMethodId))) return badReference();

  const { occurredAt, year, month } = resolveOccurredAt(body.occurredAt);
  const rawText = `[manual] ${body.direction === "out" ? "จ่าย" : "รับ"} ${body.name} ${amount}`;

  const created = await prisma.transaction.create({
    data: {
      userId,
      source: "manual",
      rawText,
      status: "pending",
      direction: body.direction,
      name: body.name,
      amount,
      note: body.note || null,
      paymentMethodId,
      occurredAt,
      year,
      month,
    },
  });
  return NextResponse.json(created, { status: 201 });
}
