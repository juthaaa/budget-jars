import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { resolveOccurredAt } from "@/lib/transaction-time";

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const body = await request.json();
  const data: Prisma.TransactionUpdateInput = {};

  if ("direction" in body) {
    if (body.direction !== "in" && body.direction !== "out") {
      return NextResponse.json({ error: "ประเภทรายการไม่ถูกต้อง" }, { status: 400 });
    }
    data.direction = body.direction;
  }
  if ("name" in body) {
    if (!body.name) {
      return NextResponse.json({ error: "กรุณาระบุชื่อรายการ" }, { status: 400 });
    }
    data.name = body.name;
  }
  if ("amount" in body) {
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "จำนวนเงินต้องมากกว่า 0" }, { status: 400 });
    }
    data.amount = amount;
  }
  if ("note" in body) {
    data.note = body.note || null;
  }
  if ("status" in body) {
    if (body.status !== "pending" && body.status !== "ignored") {
      return NextResponse.json({ error: "สถานะไม่ถูกต้อง" }, { status: 400 });
    }
    data.status = body.status;
  }
  if ("occurredAt" in body) {
    if (!body.occurredAt) {
      return NextResponse.json({ error: "กรุณาระบุวันที่-เวลา" }, { status: 400 });
    }
    const { occurredAt, year, month } = resolveOccurredAt(body.occurredAt);
    data.occurredAt = occurredAt;
    data.year = year;
    data.month = month;
  }

  const updated = await prisma.transaction.update({
    where: { id: parseInt(params.id) },
    data,
  });
  return NextResponse.json(updated);
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  await prisma.transaction.delete({ where: { id: parseInt(params.id) } });
  return NextResponse.json({ ok: true });
}
