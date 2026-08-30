import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { badReference, currentUserId, notFound, scopedWrite, unauthorized } from "@/lib/auth";
import { owns } from "@/lib/ownership";
import { recalcLoanChildren } from "@/lib/loan-children";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

const ALLOWED_RATE_TYPES = new Set(["absolute", "ref_spread"]);
const ALLOWED_INTEREST_MODES = new Set(["monthly", "daily"]);

type BandInput = {
  fromInstallment: number;
  toInstallment: number | null;
  rateType: string;
  refCode?: string | null;
  value: number;
  paymentOverride?: number | null;
  label?: string | null;
};

function validateBands(bands: BandInput[], termMonths: number): string | null {
  if (bands.length === 0) return "ต้องมีขั้นดอกเบี้ยอย่างน้อย 1 ขั้น";
  const sorted = [...bands].sort((a, b) => a.fromInstallment - b.fromInstallment);
  if (sorted[0].fromInstallment !== 1) return "ขั้นแรกต้องเริ่มที่งวดที่ 1";

  for (let i = 0; i < sorted.length; i++) {
    const band = sorted[i];
    if (!ALLOWED_RATE_TYPES.has(band.rateType)) return `ประเภทอัตราไม่ถูกต้อง: ${band.rateType}`;
    if (band.rateType === "ref_spread" && !band.refCode) return "ขั้นที่อ้างอิงอัตราต้องระบุรหัสอัตราอ้างอิง (เช่น MRR)";

    const isLast = i === sorted.length - 1;
    const to = band.toInstallment ?? termMonths;
    if (isLast) {
      if (band.toInstallment != null && band.toInstallment < termMonths) {
        return `ขั้นสุดท้ายต้องครอบคลุมถึงงวดที่ ${termMonths} (หรือเว้นว่างไว้)`;
      }
    } else {
      const next = sorted[i + 1];
      if (next.fromInstallment !== to + 1) {
        return `ขั้นดอกเบี้ยมีช่องว่างหรือทับซ้อนกันระหว่างงวดที่ ${to} กับ ${next.fromInstallment}`;
      }
    }
  }
  return null;
}

type ChildRow = { id: number; installmentNumber: number | null; loanItemKind: string | null; _count: { expenses: number } };

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const userId = await currentUserId();
  if (userId === null) return unauthorized();

  const plan = await db.loanPlan.findFirst({
    where: { id: parseInt(params.id), userId },
    include: {
      paymentMethod: { select: { id: true, name: true } },
      bands: { orderBy: { fromInstallment: "asc" } },
      referenceRates: { orderBy: { effectiveFrom: "asc" } },
      prepayments: { orderBy: { fromInstallment: "asc" } },
      items: {
        select: { id: true, installmentNumber: true, loanItemKind: true, amount: true, _count: { select: { expenses: true } } },
        orderBy: { installmentNumber: "asc" },
      },
    },
  });
  if (!plan) return notFound();

  type ItemRow = { installmentNumber: number | null; loanItemKind: string | null; _count: { expenses: number } };
  return NextResponse.json({
    ...plan,
    // Only the scheduled-payment child counts — see the matching comment in
    // GET /api/loan-plans.
    seededCount: plan.items.filter((i: ItemRow) => i.loanItemKind !== "prepay" && i._count.expenses > 0).length,
  });
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const userId = await currentUserId();
  if (userId === null) return unauthorized();

  const id = parseInt(params.id);
  const body = await request.json();
  const {
    name,
    jarCode,
    paymentMethodId,
    principalAmount,
    termMonths,
    startDate,
    firstPaymentDate,
    interestMode,
    monthlyFeeAmount,
    monthlyFeeMonths,
    note,
    bands,
    referenceRates,
  } = body;

  const existing = await db.loanPlan.findFirst({
    where: { id, userId },
    include: {
      items: {
        select: { installmentNumber: true, loanItemKind: true, _count: { select: { expenses: true } } },
      },
    },
  });
  if (!existing) return notFound();

  // Only a seeded "installment" child freezes anything — see
  // lib/loan-children.ts's freeze rule.
  const maxSeeded = (existing.items as ChildRow[]).reduce(
    (max, c) => (c.loanItemKind !== "prepay" && c._count.expenses > 0 ? Math.max(max, c.installmentNumber ?? 0) : max),
    0
  );

  const term = parseInt(termMonths);
  if (!term || term < 1) {
    return NextResponse.json({ error: "จำนวนงวดต้องมากกว่าหรือเท่ากับ 1" }, { status: 400 });
  }
  if (term < maxSeeded) {
    return NextResponse.json(
      { error: `ไม่สามารถลดจำนวนงวดได้ต่ำกว่า ${maxSeeded} เพราะงวดที่ ${maxSeeded} ถูกดึงไปแล้ว` },
      { status: 400 }
    );
  }

  const newName = String(name ?? existing.name).trim();
  const newJarCode = jarCode || existing.jarCode;
  if ((newName !== existing.name || newJarCode !== existing.jarCode) && maxSeeded > 0) {
    return NextResponse.json(
      { error: "ไม่สามารถเปลี่ยน Expense Type ได้ เพราะมีงวดที่ถูกดึงไปแล้ว" },
      { status: 400 }
    );
  }

  const principal = parseFloat(principalAmount);
  if (!principal || principal <= 0) {
    return NextResponse.json({ error: "ยอดกู้ต้องมากกว่า 0" }, { status: 400 });
  }
  const startDateParsed = new Date(startDate);
  if (isNaN(startDateParsed.getTime())) {
    return NextResponse.json({ error: "วันที่เริ่มสัญญาไม่ถูกต้อง" }, { status: 400 });
  }
  let firstPaymentDateParsed: Date | null = null;
  if (firstPaymentDate) {
    firstPaymentDateParsed = new Date(firstPaymentDate);
    if (isNaN(firstPaymentDateParsed.getTime())) {
      return NextResponse.json({ error: "วันครบกำหนดชำระงวดแรกไม่ถูกต้อง" }, { status: 400 });
    }
    if (firstPaymentDateParsed.getTime() <= startDateParsed.getTime()) {
      return NextResponse.json({ error: "วันครบกำหนดชำระงวดแรกต้องอยู่หลังวันที่เริ่มสัญญา" }, { status: 400 });
    }
  }
  const newStartDate = new Date(
    Date.UTC(startDateParsed.getUTCFullYear(), startDateParsed.getUTCMonth(), startDateParsed.getUTCDate())
  );
  const newFirstPaymentDate = firstPaymentDateParsed
    ? new Date(
        Date.UTC(
          firstPaymentDateParsed.getUTCFullYear(),
          firstPaymentDateParsed.getUTCMonth(),
          firstPaymentDateParsed.getUTCDate()
        )
      )
    : null;
  const principalChanged = principal !== existing.principalAmount;
  const startChanged = newStartDate.getTime() !== new Date(existing.startDate).getTime();
  const existingFirstPayment = existing.firstPaymentDate ? new Date(existing.firstPaymentDate).getTime() : null;
  const firstPaymentChanged = (newFirstPaymentDate?.getTime() ?? null) !== existingFirstPayment;
  if ((principalChanged || startChanged || firstPaymentChanged) && maxSeeded > 0) {
    return NextResponse.json(
      { error: "ไม่สามารถแก้ยอดกู้ วันที่เริ่มสัญญา หรือวันครบกำหนดงวดแรกได้ เพราะมีงวดที่ถูกดึงไปแล้ว" },
      { status: 400 }
    );
  }

  const mode = ALLOWED_INTEREST_MODES.has(interestMode) ? interestMode : existing.interestMode;

  const bandInputs: BandInput[] = Array.isArray(bands) ? bands : [];
  const bandError = validateBands(bandInputs, term);
  if (bandError) return NextResponse.json({ error: bandError }, { status: 400 });

  const rateInputs: { code: string; value: number; effectiveFrom: string; isAssumption?: boolean; note?: string }[] =
    Array.isArray(referenceRates) ? referenceRates : [];
  const rateCodesProvided = new Set(rateInputs.map((r) => r.code));
  for (const band of bandInputs) {
    if (band.rateType === "ref_spread" && band.refCode && !rateCodesProvided.has(band.refCode)) {
      return NextResponse.json(
        { error: `ไม่มีอัตราอ้างอิง ${band.refCode} ที่กรอกไว้ให้ขั้นดอกเบี้ยนี้อ้างอิง` },
        { status: 400 }
      );
    }
  }

  const pmIdNorm: number | null = paymentMethodId ?? null;
  if (!(await owns(userId, "paymentMethod", pmIdNorm))) return badReference();

  const jar = await db.jar.findFirst({ where: { userId, code: newJarCode }, select: { id: true } });
  if (!jar) return NextResponse.json({ error: `ไม่พบ Jar รหัส "${newJarCode}"` }, { status: 400 });

  const recalc = await db.$transaction(async (tx: typeof db) => {
    await tx.loanPlan.update({
      where: { id, userId },
      data: {
        name: newName,
        jarCode: newJarCode,
        paymentMethodId: pmIdNorm,
        principalAmount: principal,
        termMonths: term,
        startDate: newStartDate,
        firstPaymentDate: newFirstPaymentDate,
        interestMode: mode,
        monthlyFeeAmount: monthlyFeeAmount != null ? parseFloat(monthlyFeeAmount) || null : null,
        monthlyFeeMonths: monthlyFeeMonths != null ? parseInt(monthlyFeeMonths) || null : null,
        note: note ?? null,
      },
    });

    // Bands and reference rates are small and derived-only — replace the whole
    // set, same pattern as MonthlyIncome on PATCH /api/months/[yearMonth].
    await tx.loanRateBand.deleteMany({ where: { loanPlanId: id } });
    if (bandInputs.length > 0) {
      await tx.loanRateBand.createMany({
        data: bandInputs.map((b, i) => ({
          userId,
          loanPlanId: id,
          fromInstallment: b.fromInstallment,
          toInstallment: b.toInstallment ?? null,
          rateType: b.rateType,
          refCode: b.refCode ?? null,
          value: parseFloat(String(b.value)) || 0,
          paymentOverride: b.paymentOverride != null ? parseFloat(String(b.paymentOverride)) || null : null,
          label: b.label ?? null,
          sortOrder: i,
        })),
      });
    }

    await tx.loanReferenceRate.deleteMany({ where: { loanPlanId: id } });
    if (rateInputs.length > 0) {
      await tx.loanReferenceRate.createMany({
        data: rateInputs.map((r) => ({
          userId,
          loanPlanId: id,
          code: r.code,
          value: parseFloat(String(r.value)) || 0,
          effectiveFrom: new Date(r.effectiveFrom),
          isAssumption: !!r.isAssumption,
          note: r.note ?? null,
        })),
      });
    }

    if (newName !== existing.name || newJarCode !== existing.jarCode) {
      await tx.recurringExpense.updateMany({
        where: { loanPlanId: id },
        data: { name: newName, jarCode: newJarCode },
      });
    }

    return recalcLoanChildren(tx, userId, id);
  });

  return NextResponse.json({ ok: true, ...recalc });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const userId = await currentUserId();
  if (userId === null) return unauthorized();

  const deleted = await scopedWrite(() =>
    db.loanPlan.delete({ where: { id: parseInt(params.id), userId } })
  );
  if (!deleted) return notFound();
  return NextResponse.json({ ok: true });
}
