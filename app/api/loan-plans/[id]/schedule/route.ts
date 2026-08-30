import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { currentUserId, notFound, unauthorized } from "@/lib/auth";
import { buildSchedule, type ActualInstallment, type LoanInput, type Prepayment, type RateBand, type ReferenceRate } from "@/lib/loan-schedule";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

// Merges the pure-lib schedule with what's actually in the database: which
// installments have been seeded into a month, and which Expense/MonthlyRecord
// they landed in. The schedule math itself is identical to what the "use
// client" workbench page computes locally — this route exists only to attach
// that DB-side truth, not to duplicate the calculation.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const userId = await currentUserId();
  if (userId === null) return unauthorized();

  const planId = parseInt(params.id);
  const plan = await db.loanPlan.findFirst({
    where: { id: planId, userId },
    include: {
      bands: { orderBy: { fromInstallment: "asc" } },
      referenceRates: { orderBy: { effectiveFrom: "asc" } },
      prepayments: { orderBy: { fromInstallment: "asc" } },
      items: {
        select: {
          installmentNumber: true,
          loanItemKind: true,
          amount: true,
          expenses: { select: { id: true, monthlyRecordId: true } },
        },
        orderBy: { installmentNumber: "asc" },
      },
    },
  });
  if (!plan) return notFound();

  type ItemRow = {
    installmentNumber: number | null;
    loanItemKind: string | null;
    amount: number;
    expenses: { id: number; monthlyRecordId: number }[];
  };
  const items: ItemRow[] = plan.items;

  // Two separate metas — the installment child's seeded state and the
  // prepay child's — since a month can have seeded one without the other
  // (see lib/loan-children.ts's freeze rule). `prepayPendingByN` covers the
  // opposite case: a prepay child exists (a โปะ is due) but hasn't been
  // seeded into any month yet.
  const installmentMeta = new Map<number, { expenseId: number; monthlyRecordId: number }>();
  const prepayMeta = new Map<number, { expenseId: number; monthlyRecordId: number }>();
  const prepayPendingByN = new Map<number, number>();
  const instAmountByN = new Map<number, number>();
  const prepayAmountByN = new Map<number, number>();
  for (const item of items) {
    if (item.installmentNumber == null) continue;
    const n = item.installmentNumber;
    if (item.loanItemKind === "prepay") {
      prepayAmountByN.set(n, item.amount);
      if (item.expenses.length > 0) {
        prepayMeta.set(n, { expenseId: item.expenses[0].id, monthlyRecordId: item.expenses[0].monthlyRecordId });
      } else {
        prepayPendingByN.set(n, item.amount);
      }
    } else {
      instAmountByN.set(n, item.amount);
      if (item.expenses.length > 0) {
        installmentMeta.set(n, { expenseId: item.expenses[0].id, monthlyRecordId: item.expenses[0].monthlyRecordId });
      }
    }
  }

  const actualPayments = new Map<number, ActualInstallment>();
  for (const n of installmentMeta.keys()) {
    const extra = prepayMeta.has(n) ? (prepayAmountByN.get(n) ?? 0) : 0;
    actualPayments.set(n, { payment: instAmountByN.get(n) ?? 0, extra });
  }
  const maxSeeded = installmentMeta.size > 0 ? Math.max(...installmentMeta.keys()) : 0;

  const startDateParsed = new Date(plan.startDate);
  const firstPaymentDateParsed: Date | null = plan.firstPaymentDate ? new Date(plan.firstPaymentDate) : null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bands: RateBand[] = plan.bands.map((b: any) => ({
    fromInstallment: b.fromInstallment,
    toInstallment: b.toInstallment,
    rateType: b.rateType,
    refCode: b.refCode,
    value: b.value,
    paymentOverride: b.paymentOverride,
    label: b.label,
  }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const referenceRates: ReferenceRate[] = plan.referenceRates.map((r: any) => ({
    code: r.code,
    value: r.value,
    effectiveFrom: new Date(r.effectiveFrom),
  }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prepayments: Prepayment[] = plan.prepayments.map((p: any) => ({
    kind: p.kind,
    fromInstallment: p.fromInstallment,
    toInstallment: p.toInstallment,
    amount: p.amount,
  }));

  const input: LoanInput = {
    principal: plan.principalAmount,
    termMonths: plan.termMonths,
    contractStart: {
      year: startDateParsed.getUTCFullYear(),
      month: startDateParsed.getUTCMonth() + 1,
      day: startDateParsed.getUTCDate(),
    },
    firstPaymentDate: firstPaymentDateParsed
      ? {
          year: firstPaymentDateParsed.getUTCFullYear(),
          month: firstPaymentDateParsed.getUTCMonth() + 1,
          day: firstPaymentDateParsed.getUTCDate(),
        }
      : undefined,
    bands,
    referenceRates,
    prepayments,
    interestMode: plan.interestMode,
    actualPayments,
  };

  const schedule = buildSchedule(input);
  const rows = schedule.rows.map((row) => {
    const n = row.installmentNumber;
    const meta = installmentMeta.get(n);
    const prepayMetaRow = prepayMeta.get(n);
    return {
      ...row,
      seeded: !!meta,
      expenseId: meta?.expenseId ?? null,
      monthlyRecordId: meta?.monthlyRecordId ?? null,
      prepaySeeded: !!prepayMetaRow,
      prepayExpenseId: prepayMetaRow?.expenseId ?? null,
      prepayMonthlyRecordId: prepayMetaRow?.monthlyRecordId ?? null,
      prepayPending: prepayPendingByN.has(n),
    };
  });

  return NextResponse.json({
    plan: {
      id: plan.id,
      name: plan.name,
      jarCode: plan.jarCode,
      paymentMethodId: plan.paymentMethodId,
      principalAmount: plan.principalAmount,
      termMonths: plan.termMonths,
      startDate: plan.startDate,
      firstPaymentDate: plan.firstPaymentDate,
      interestMode: plan.interestMode,
      monthlyFeeAmount: plan.monthlyFeeAmount,
      monthlyFeeMonths: plan.monthlyFeeMonths,
    },
    bands: plan.bands,
    referenceRates: plan.referenceRates,
    prepayments: plan.prepayments,
    rows,
    bandSummaries: schedule.bands,
    totalInterest: schedule.totalInterest,
    totalPaid: schedule.totalPaid,
    payoffMonths: schedule.payoffMonths,
    payoffYear: schedule.payoffYear,
    payoffMonth: schedule.payoffMonth,
    neverPaysOff: schedule.neverPaysOff,
    hasNegativeAmortization: schedule.hasNegativeAmortization,
    averageRateFirst3Years: schedule.averageRateFirst3Years,
    maxSeeded,
  });
}
