import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isPaymentMethodLocked } from "@/lib/settlement-lock";
import { badReference, currentUserId, notFound, unauthorized } from "@/lib/auth";
import { owns } from "@/lib/ownership";

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const userId = await currentUserId();
  if (userId === null) return unauthorized();

  const id = parseInt(params.id);
  const body = await request.json();

  const existing = await prisma.expense.findFirst({
    where: { id, userId },
    select: { monthlyRecordId: true, paymentMethodId: true, isLocked: true },
  });
  if (!existing) return notFound();

  // Lock toggle: body contains only `isLocked` → allow toggling on/off
  // (still blocked if the expense's payment method has been reconciled).
  const isLockToggle = Object.keys(body).length === 1 && "isLocked" in body;
  if (isLockToggle) {
    if (await isPaymentMethodLocked(existing.monthlyRecordId, existing.paymentMethodId)) {
      return NextResponse.json(
        { error: "รายการนี้อยู่ใน payment method ที่ตรวจสอบแล้ว ไม่สามารถแก้ไขได้" },
        { status: 403 },
      );
    }
    const updated = await prisma.expense.update({
      where: { id },
      data: { isLocked: !!body.isLocked },
      include: { bankAccount: true, paymentMethod: { select: { id: true, name: true } } },
    });
    return NextResponse.json(updated);
  }

  if (existing.isLocked) {
    return NextResponse.json(
      { error: "รายการนี้ถูกล็อก ไม่สามารถแก้ไขได้" },
      { status: 403 },
    );
  }

  if (await isPaymentMethodLocked(existing.monthlyRecordId, existing.paymentMethodId)) {
    return NextResponse.json(
      { error: "รายการนี้อยู่ใน payment method ที่ตรวจสอบแล้ว ไม่สามารถแก้ไขได้" },
      { status: 403 },
    );
  }
  const nextPaymentMethodId: number | null = body.paymentMethodId ?? null;
  if (
    nextPaymentMethodId !== existing.paymentMethodId &&
    (await isPaymentMethodLocked(existing.monthlyRecordId, nextPaymentMethodId))
  ) {
    return NextResponse.json(
      { error: "Payment method ปลายทางถูกตรวจสอบแล้ว ไม่สามารถย้ายรายการเข้าได้" },
      { status: 403 },
    );
  }

  const bankAccountId: number | null = body.bankAccountId || null;
  if (
    !(await owns(userId, "bankAccount", bankAccountId)) ||
    !(await owns(userId, "paymentMethod", nextPaymentMethodId))
  ) {
    return badReference();
  }

  const expense = await prisma.expense.update({
    where: { id },
    data: {
      name: body.name,
      jarCode: body.jarCode,
      amount: parseFloat(body.amount),
      bankAccountId,
      note: body.note || null,
      paymentMethodId: nextPaymentMethodId,
    },
    include: { bankAccount: true, paymentMethod: { select: { id: true, name: true } } },
  });
  return NextResponse.json(expense);
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const userId = await currentUserId();
  if (userId === null) return unauthorized();

  const id = parseInt(params.id);
  const existing = await prisma.expense.findFirst({
    where: { id, userId },
    select: { monthlyRecordId: true, paymentMethodId: true, isLocked: true },
  });
  if (!existing) return notFound();

  if (existing.isLocked) {
    return NextResponse.json(
      { error: "รายการนี้ถูกล็อก ไม่สามารถลบได้" },
      { status: 403 },
    );
  }

  if (await isPaymentMethodLocked(existing.monthlyRecordId, existing.paymentMethodId)) {
    return NextResponse.json(
      { error: "รายการนี้อยู่ใน payment method ที่ตรวจสอบแล้ว ไม่สามารถลบได้" },
      { status: 403 },
    );
  }

  await prisma.expense.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
