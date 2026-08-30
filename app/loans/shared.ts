// Shared client-side types + conversion helpers for the loan-plan pages.
// Both /loans (list) and /loans/[id] (workbench) need to turn a plan fetched
// from the API into a lib/loan-schedule LoanInput and run buildSchedule
// locally — that's what makes prepayment/rate sliders instant with no
// round-trip, and guarantees the UI never disagrees with what the server
// would compute for the same inputs.
import type { ActualInstallment, LoanInput, Prepayment, RateBand, RateType, ReferenceRate } from "@/lib/loan-schedule";

export interface BandDTO {
  id?: number;
  fromInstallment: number;
  toInstallment: number | null;
  rateType: string;
  refCode: string | null;
  value: number;
  paymentOverride: number | null;
  label: string | null;
  sortOrder?: number;
}

export interface ReferenceRateDTO {
  id?: number;
  code: string;
  value: number;
  effectiveFrom: string;
  isAssumption: boolean;
  note: string | null;
}

export interface PrepaymentDTO {
  id?: number;
  kind: string;
  fromInstallment: number;
  toInstallment: number | null;
  amount: number;
  note: string | null;
}

export interface LoanPlanDTO {
  id: number;
  name: string;
  jarCode: string;
  paymentMethodId: number | null;
  paymentMethod: { id: number; name: string } | null;
  principalAmount: number;
  termMonths: number;
  startDate: string;
  firstPaymentDate: string | null;
  interestMode: "monthly" | "daily";
  monthlyFeeAmount: number | null;
  monthlyFeeMonths: number | null;
  note: string | null;
  bands: BandDTO[];
  referenceRates: ReferenceRateDTO[];
  prepayments: PrepaymentDTO[];
  items: {
    installmentNumber: number | null;
    loanItemKind: string | null;
    amount: number;
    _count: { expenses: number };
  }[];
  seededCount: number;
}

export function planToLoanInput(plan: LoanPlanDTO, overridePrepayments?: Prepayment[]): LoanInput {
  const start = new Date(plan.startDate);
  const firstPayment = plan.firstPaymentDate ? new Date(plan.firstPaymentDate) : null;
  const bands: RateBand[] = plan.bands.map((b) => ({
    fromInstallment: b.fromInstallment,
    toInstallment: b.toInstallment,
    rateType: b.rateType as RateType,
    refCode: b.refCode,
    value: b.value,
    paymentOverride: b.paymentOverride,
    label: b.label,
  }));
  const referenceRates: ReferenceRate[] = plan.referenceRates.map((r) => ({
    code: r.code,
    value: r.value,
    effectiveFrom: new Date(r.effectiveFrom),
  }));
  const prepayments: Prepayment[] =
    overridePrepayments ??
    plan.prepayments.map((p) => ({
      kind: p.kind as Prepayment["kind"],
      fromInstallment: p.fromInstallment,
      toInstallment: p.toInstallment,
      amount: p.amount,
    }));

  // Mirrors lib/loan-children.ts's freeze rule: only a seeded "installment"
  // child freezes a row, and its extra comes from the "prepay" sibling only
  // when that sibling was also seeded — so a plan-side draft can never
  // disagree with what the server persists for the same inputs.
  const instAmountByN = new Map<number, { amount: number; seeded: boolean }>();
  const prepayAmountByN = new Map<number, { amount: number; seeded: boolean }>();
  for (const item of plan.items) {
    if (item.installmentNumber == null) continue;
    const seeded = item._count.expenses > 0;
    if (item.loanItemKind === "prepay") prepayAmountByN.set(item.installmentNumber, { amount: item.amount, seeded });
    else instAmountByN.set(item.installmentNumber, { amount: item.amount, seeded });
  }
  const actualPayments = new Map<number, ActualInstallment>();
  for (const [n, inst] of instAmountByN) {
    if (!inst.seeded) continue;
    const prepay = prepayAmountByN.get(n);
    actualPayments.set(n, { payment: inst.amount, extra: prepay && prepay.seeded ? prepay.amount : 0 });
  }

  return {
    principal: plan.principalAmount,
    termMonths: plan.termMonths,
    contractStart: { year: start.getUTCFullYear(), month: start.getUTCMonth() + 1, day: start.getUTCDate() },
    firstPaymentDate: firstPayment
      ? { year: firstPayment.getUTCFullYear(), month: firstPayment.getUTCMonth() + 1, day: firstPayment.getUTCDate() }
      : undefined,
    bands,
    referenceRates,
    prepayments,
    interestMode: plan.interestMode,
    actualPayments,
  };
}

export function emptyBand(fromInstallment: number): BandDTO {
  return {
    fromInstallment,
    toInstallment: null,
    rateType: "absolute",
    refCode: null,
    value: 0,
    paymentOverride: null,
    label: null,
  };
}
