import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { currentUserId, notFound, unauthorized } from "@/lib/auth";
import { maxSeededInstallment, recalcLoanChildren } from "@/lib/loan-children";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

const ALLOWED_KINDS = new Set(["recurring", "one_off"]);

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const userId = await currentUserId();
  if (userId === null) return unauthorized();

  const planId = parseInt(params.id);
  const plan = await db.loanPlan.findFirst({ where: { id: planId, userId }, select: { id: true } });
  if (!plan) return notFound();

  const body = await request.json();
  const { kind, fromInstallment, toInstallment, amount, note } = body;

  if (!ALLOWED_KINDS.has(kind)) {
    return NextResponse.json({ error: `ประเภทการโปะไม่ถูกต้อง: ${kind}` }, { status: 400 });
  }
  const from = parseInt(fromInstallment);
  if (!from || from < 1) {
    return NextResponse.json({ error: "งวดที่เริ่มโปะต้องมากกว่าหรือเท่ากับ 1" }, { status: 400 });
  }
  const amt = parseFloat(amount);
  if (!amt || amt <= 0) {
    return NextResponse.json({ error: "จำนวนเงินโปะต้องมากกว่า 0" }, { status: 400 });
  }
  const to = kind === "recurring" && toInstallment != null ? parseInt(toInstallment) : null;
  if (to != null && to < from) {
    return NextResponse.json({ error: "งวดสิ้นสุดต้องไม่น้อยกว่างวดเริ่มต้น" }, { status: 400 });
  }

  // A โปะ starting at or before an already-seeded installment can never
  // change what was actually charged that month — block it outright instead
  // of silently accepting it with a warning, so the only way to change a
  // seeded month is to delete it in the month page and re-seed.
  const maxSeeded = await maxSeededInstallment(db, userId, planId);
  if (from <= maxSeeded) {
    return NextResponse.json(
      {
        error: `ไม่สามารถเพิ่มโปะที่งวด ≤ ${maxSeeded} ได้ เพราะงวดนั้นถูกดึงเข้าเดือนไปแล้ว — ถ้าต้องการแก้ ให้ไปลบรายการในเดือนนั้นก่อน แล้วค่อยดึงใหม่`,
      },
      { status: 400 }
    );
  }

  const result = await db.$transaction(async (tx: typeof db) => {
    const created = await tx.loanPrepayment.create({
      data: {
        userId,
        loanPlanId: planId,
        kind,
        fromInstallment: from,
        toInstallment: kind === "one_off" ? null : to,
        amount: amt,
        note: note ?? null,
      },
    });
    const recalc = await recalcLoanChildren(tx, userId, planId);
    return { created, recalc };
  }, { timeout: 15000 });

  return NextResponse.json({ prepayment: result.created, recalc: result.recalc }, { status: 201 });
}
