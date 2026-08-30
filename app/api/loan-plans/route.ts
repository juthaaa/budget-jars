import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { badReference, currentUserId, unauthorized } from "@/lib/auth";
import { owns } from "@/lib/ownership";
import { recalcLoanChildren } from "@/lib/loan-children";
import { addMonths, type RateBand } from "@/lib/loan-schedule";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

const ALLOWED_RATE_TYPES = new Set(["absolute", "ref_spread"]);
const ALLOWED_INTEREST_MODES = new Set(["monthly", "daily"]);
const ALLOWED_PREPAYMENT_KINDS = new Set(["recurring", "one_off"]);

type BandInput = {
  fromInstallment: number;
  toInstallment: number | null;
  rateType: string;
  refCode?: string | null;
  value: number;
  paymentOverride?: number | null;
  label?: string | null;
};

/** Bands must start at 1, cover every installment with no gaps or overlaps,
 *  and end exactly at (or past) termMonths. Returns a Thai error, or null if valid. */
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

export async function GET() {
  const userId = await currentUserId();
  if (userId === null) return unauthorized();

  const plans = await db.loanPlan.findMany({
    where: { userId },
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
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });

  type ItemRow = { installmentNumber: number | null; loanItemKind: string | null; _count: { expenses: number } };
  const withCounts = plans.map((p: { items: ItemRow[] }) => ({
    ...p,
    // Only the scheduled-payment child counts toward "งวดที่ N จาก M" — a
    // seeded prepay sibling must not double the progress percentage.
    seededCount: p.items.filter((i) => i.loanItemKind !== "prepay" && i._count.expenses > 0).length,
  }));

  return NextResponse.json(withCounts);
}

export async function POST(request: Request) {
  const userId = await currentUserId();
  if (userId === null) return unauthorized();

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
    prepayments,
  } = body;

  if (!name || !String(name).trim()) {
    return NextResponse.json({ error: "ต้องระบุชื่อสินเชื่อ" }, { status: 400 });
  }
  const principal = parseFloat(principalAmount);
  if (!principal || principal <= 0) {
    return NextResponse.json({ error: "ยอดกู้ต้องมากกว่า 0" }, { status: 400 });
  }
  const term = parseInt(termMonths);
  if (!term || term < 1) {
    return NextResponse.json({ error: "จำนวนงวดต้องมากกว่าหรือเท่ากับ 1" }, { status: 400 });
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
  const mode = ALLOWED_INTEREST_MODES.has(interestMode) ? interestMode : "monthly";

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

  const prepaymentInputs: { kind: string; fromInstallment: number; toInstallment?: number | null; amount: number; note?: string }[] =
    Array.isArray(prepayments) ? prepayments : [];
  for (const p of prepaymentInputs) {
    if (!ALLOWED_PREPAYMENT_KINDS.has(p.kind)) {
      return NextResponse.json({ error: `ประเภทการโปะไม่ถูกต้อง: ${p.kind}` }, { status: 400 });
    }
  }

  const pmIdNorm: number | null = paymentMethodId ?? null;
  if (!(await owns(userId, "paymentMethod", pmIdNorm))) return badReference();

  const jar = await db.jar.findFirst({ where: { userId, code: jarCode }, select: { id: true } });
  if (!jar) return NextResponse.json({ error: `ไม่พบ Jar รหัส "${jarCode}"` }, { status: 400 });

  const startYear = startDateParsed.getUTCFullYear();
  const startMonth = startDateParsed.getUTCMonth(); // 0-based; only used below for the fee rule's own dates
  const normalizedStartDate = new Date(
    Date.UTC(startYear, startMonth, startDateParsed.getUTCDate())
  );
  const normalizedFirstPaymentDate = firstPaymentDateParsed
    ? new Date(
        Date.UTC(
          firstPaymentDateParsed.getUTCFullYear(),
          firstPaymentDateParsed.getUTCMonth(),
          firstPaymentDateParsed.getUTCDate()
        )
      )
    : null;

  const plan = await db.$transaction(async (tx: typeof db) => {
    const created = await tx.loanPlan.create({
      data: {
        userId,
        name: String(name).trim(),
        jarCode,
        paymentMethodId: pmIdNorm,
        principalAmount: principal,
        termMonths: term,
        startDate: normalizedStartDate,
        firstPaymentDate: normalizedFirstPaymentDate,
        interestMode: mode,
        monthlyFeeAmount: monthlyFeeAmount != null ? parseFloat(monthlyFeeAmount) || null : null,
        monthlyFeeMonths: monthlyFeeMonths != null ? parseInt(monthlyFeeMonths) || null : null,
        note: note ?? null,
        sortOrder: 0,
      },
    });

    if (bandInputs.length > 0) {
      await tx.loanRateBand.createMany({
        data: bandInputs.map((b, i) => ({
          userId,
          loanPlanId: created.id,
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

    if (rateInputs.length > 0) {
      await tx.loanReferenceRate.createMany({
        data: rateInputs.map((r) => ({
          userId,
          loanPlanId: created.id,
          code: r.code,
          value: parseFloat(String(r.value)) || 0,
          effectiveFrom: new Date(r.effectiveFrom),
          isAssumption: !!r.isAssumption,
          note: r.note ?? null,
        })),
      });
    }

    if (prepaymentInputs.length > 0) {
      await tx.loanPrepayment.createMany({
        data: prepaymentInputs.map((p) => ({
          userId,
          loanPlanId: created.id,
          kind: p.kind,
          fromInstallment: p.fromInstallment,
          toInstallment: p.toInstallment ?? null,
          amount: parseFloat(String(p.amount)) || 0,
          note: p.note ?? null,
        })),
      });
    }

    // Optional monthly fee (e.g. MRTA) rides as its own plain recurring rule —
    // not principal/interest on the loan, so it must never enter buildSchedule.
    const feeAmount = created.monthlyFeeAmount;
    const feeMonths = created.monthlyFeeMonths;
    if (feeAmount && feeAmount > 0 && feeMonths && feeMonths > 0) {
      // startMonth here is 0-based (getUTCMonth()); addMonths wants 1-based.
      const feeEnd = addMonths(startYear, startMonth + 1, feeMonths - 1);
      const feeRule = await tx.recurringExpense.create({
        data: {
          userId,
          name: `${created.name} — ค่าประกัน`,
          jarCode: created.jarCode,
          amount: feeAmount,
          startDate: new Date(Date.UTC(startYear, startMonth, 1)),
          endDate: new Date(Date.UTC(feeEnd.year, feeEnd.month - 1, 1)),
          paymentMethodId: pmIdNorm,
          sortOrder: 0,
          intervalValue: 1,
          intervalUnit: "month",
        },
      });
      await tx.loanPlan.update({
        where: { id: created.id },
        data: { monthlyFeeRecurringExpenseId: feeRule.id },
      });
    }

    await recalcLoanChildren(tx, userId, created.id);

    return tx.loanPlan.findUnique({
      where: { id: created.id },
      include: {
        paymentMethod: { select: { id: true, name: true } },
        bands: { orderBy: { fromInstallment: "asc" } },
        referenceRates: { orderBy: { effectiveFrom: "asc" } },
        prepayments: { orderBy: { fromInstallment: "asc" } },
        items: { orderBy: { installmentNumber: "asc" } },
      },
    });
  });

  return NextResponse.json(plan, { status: 201 });
}
