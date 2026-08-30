import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { currentUserId, notFound, unauthorized } from "@/lib/auth";
import { maxSeededInstallment, recalcLoanChildren } from "@/lib/loan-children";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

const ALLOWED_KINDS = new Set(["recurring", "one_off"]);

export async function PATCH(
  request: Request,
  { params }: { params: { id: string; pid: string } }
) {
  const userId = await currentUserId();
  if (userId === null) return unauthorized();

  const planId = parseInt(params.id);
  const prepaymentId = parseInt(params.pid);
  const existing = await db.loanPrepayment.findFirst({
    where: { id: prepaymentId, loanPlanId: planId, userId },
  });
  if (!existing) return notFound();

  const body = await request.json();
  const { kind, fromInstallment, toInstallment, amount, note } = body;

  const newKind = ALLOWED_KINDS.has(kind) ? kind : existing.kind;
  const from = fromInstallment != null ? parseInt(fromInstallment) : existing.fromInstallment;
  if (!from || from < 1) {
    return NextResponse.json({ error: "งวดที่เริ่มโปะต้องมากกว่าหรือเท่ากับ 1" }, { status: 400 });
  }
  const amt = amount != null ? parseFloat(amount) : existing.amount;
  if (!amt || amt <= 0) {
    return NextResponse.json({ error: "จำนวนเงินโปะต้องมากกว่า 0" }, { status: 400 });
  }
  const to =
    newKind === "recurring" && toInstallment != null ? parseInt(toInstallment) : null;
  if (to != null && to < from) {
    return NextResponse.json({ error: "งวดสิ้นสุดต้องไม่น้อยกว่างวดเริ่มต้น" }, { status: 400 });
  }

  // Same rule as POST: never let an edit move a โปะ's start onto or before
  // an installment that's already been seeded into a month.
  const maxSeeded = await maxSeededInstallment(db, userId, planId);
  if (from <= maxSeeded) {
    return NextResponse.json(
      {
        error: `ไม่สามารถแก้โปะให้เริ่มที่งวด ≤ ${maxSeeded} ได้ เพราะงวดนั้นถูกดึงเข้าเดือนไปแล้ว — ถ้าต้องการแก้ ให้ไปลบรายการในเดือนนั้นก่อน แล้วค่อยดึงใหม่`,
      },
      { status: 400 }
    );
  }

  const recalc = await db.$transaction(async (tx: typeof db) => {
    await tx.loanPrepayment.update({
      where: { id: prepaymentId },
      data: {
        kind: newKind,
        fromInstallment: from,
        toInstallment: newKind === "one_off" ? null : to,
        amount: amt,
        note: note ?? existing.note,
      },
    });
    return recalcLoanChildren(tx, userId, planId);
  });

  return NextResponse.json({ ok: true, recalc });
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string; pid: string } }
) {
  const userId = await currentUserId();
  if (userId === null) return unauthorized();

  const planId = parseInt(params.id);
  const prepaymentId = parseInt(params.pid);
  const existing = await db.loanPrepayment.findFirst({
    where: { id: prepaymentId, loanPlanId: planId, userId },
  });
  if (!existing) return notFound();

  const recalc = await db.$transaction(async (tx: typeof db) => {
    await tx.loanPrepayment.delete({ where: { id: prepaymentId } });
    return recalcLoanChildren(tx, userId, planId);
  });

  return NextResponse.json({ ok: true, recalc });
}
