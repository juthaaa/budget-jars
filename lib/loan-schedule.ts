// Pure amortization engine for the LoanPlan feature (สินเชื่อบ้าน + โปะ).
//
// Zero imports — no Prisma, no next/*, no Node built-ins. This lets a
// "use client" page import it directly and recompute a 480-row schedule on
// every keystroke/slider move with no network round-trip, and guarantees the
// UI's what-if preview can never disagree with what the server persists,
// because they run the literal same function.
//
// Deliberately separate from lib/amortization.ts (the single-rate
// InstallmentPlan engine) — different algorithm (banded simulation vs.
// single-rate closed-form) with intentionally different rounding rules.
// Do not merge them.
//
// ─────────────────────────────────────────────────────────────────────────
// THE ONE RULE THAT MATTERS: never round `payment` or `balance` inside the
// simulation loop. Round only at the presentation boundary (display) and
// when persisting `RecurringExpense.amount`. Rounding inside the loop is a
// ~100 THB/40yr accumulation error — e.g. a verified 40-year schedule totals
// exactly 2,102,098 THB of interest when unrounded internally, vs 2,102,004
// if payments are rounded before being fed back into the balance each month.
// See scripts/test-loan-schedule.ts Fixture A for the regression trap.
// ─────────────────────────────────────────────────────────────────────────

export type RateType = "absolute" | "ref_spread";
export type InterestMode = "monthly" | "daily";
export type PrepaymentKind = "recurring" | "one_off";

export interface ReferenceRate {
  code: string; // "MRR" | "MLR" | "MOR" | user-defined
  value: number; // e.g. 6.045
  effectiveFrom: Date; // rate holds from this date onward until superseded
}

export interface RateBand {
  fromInstallment: number; // 1-based, inclusive
  toInstallment: number | null; // null = to end of term
  rateType: RateType;
  refCode?: string | null; // required when rateType === "ref_spread"
  value: number; // absolute rate (2.49) or spread off the reference (-0.750)
  paymentOverride?: number | null; // bank-quoted fixed payment for this band; omit to auto-PMT
  label?: string | null;
}

export interface Prepayment {
  kind: PrepaymentKind;
  fromInstallment: number; // one_off: the single installment; recurring: start installment
  toInstallment?: number | null; // recurring only; null/omitted = until payoff
  amount: number;
}

export interface CalendarDate {
  year: number;
  month: number; // 1-based
  day: number;
}

export interface ActualInstallment {
  payment: number;
  extra: number;
}

export interface LoanInput {
  principal: number;
  termMonths: number;
  /** Disbursement / contract start date — can be any day of month. */
  contractStart: CalendarDate;
  /**
   * Due date of installment #1. Every later installment falls on the same
   * day-of-month, one calendar month apart (clamped for short months).
   * Defaults to exactly one month after `contractStart` — the "normal" case
   * with no stub period, which reproduces every pre-existing fixture exactly.
   * Set it explicitly when the disbursement date doesn't line up with the
   * bank's regular due day (e.g. disbursed the 25th, due the 5th) — that gap
   * becomes a short/long first period with its interest prorated by actual
   * days rather than the usual ÷12 approximation, since there's no sensible
   * "monthly" equivalent for a partial period.
   */
  firstPaymentDate?: CalendarDate;
  bands: RateBand[];
  referenceRates?: ReferenceRate[];
  prepayments?: Prepayment[];
  interestMode?: InterestMode; // default "monthly"
  /**
   * Seeded/actual installment data to replay instead of computing, keyed by
   * installmentNumber. `payment` is the recorded scheduled-payment amount
   * (excludes prepayment); `extra` is the recorded prepayment for that same
   * month (0 when the borrower didn't actually โปะ that month, even if a
   * LoanPrepayment rule nominally covers it).
   */
  actualPayments?: Map<number, ActualInstallment>;
  /** Runaway guard for negative amortization. Default termMonths * 2. */
  maxMonths?: number;
}

export interface ScheduleRow {
  installmentNumber: number;
  year: number;
  month: number; // 1-based
  day: number; // due day-of-month (installment 1 may carry a stub period before it)
  annualRate: number;
  payment: number; // scheduled base payment (unrounded); for a seeded row this is the actually-recorded payment, excludes prepayment
  extra: number; // prepayment applied this month; for a seeded row this is the actually-recorded prepayment (0 if the borrower didn't โปะ that month)
  interest: number;
  principalPaid: number; // can be negative under negative amortization
  balance: number; // closing balance
  cumulativeInterest: number;
  isBandStart: boolean;
  isActual: boolean; // replayed from actualPayments (seeded row)
  negativeAmortization: boolean;
}

export interface BandSummary {
  label: string;
  fromInstallment: number;
  toInstallment: number;
  annualRate: number;
  payment: number;
  interestInBand: number;
  principalInBand: number;
  openingBalance: number;
  closingBalance: number;
}

export interface ScheduleResult {
  rows: ScheduleRow[];
  bands: BandSummary[];
  totalInterest: number;
  totalPaid: number;
  payoffMonths: number;
  payoffYear: number;
  payoffMonth: number;
  neverPaysOff: boolean;
  hasNegativeAmortization: boolean;
  averageRateFirst3Years: number;
}

export interface SensitivityPoint {
  refRate: number;
  annualRate: number;
  monthlyInterest: number;
  negative: boolean;
}

export interface SensitivityResult {
  points: SensitivityPoint[];
  criticalRefRate: number | null;
  headroom: number | null;
  balanceAtBandStart: number | null;
  payment: number | null;
}

const round2 = (x: number) => Math.round(x * 100) / 100;

/** 1-based (year, month) offset by `offset` months. */
export function addMonths(
  startYear: number,
  startMonth: number,
  offset: number
): { year: number; month: number } {
  const total = startYear * 12 + (startMonth - 1) + offset;
  const year = Math.floor(total / 12);
  const month = (((total % 12) + 12) % 12) + 1;
  return { year, month };
}

function daysInMonth(year: number, month: number): number {
  // month is 1-based; Date.UTC(year, month, 0) = last day of `month`.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function toUTCDate(d: CalendarDate): Date {
  return new Date(Date.UTC(d.year, d.month - 1, d.day));
}

function calendarDatesEqual(a: CalendarDate, b: CalendarDate): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

/** Same day-of-month `offset` months later, clamped to the target month's length
 *  (e.g. Jan 31 + 1 month → Feb 28/29, not Mar 3). */
export function addMonthsToDate(d: CalendarDate, offset: number): CalendarDate {
  const { year, month } = addMonths(d.year, d.month, offset);
  return { year, month, day: Math.min(d.day, daysInMonth(year, month)) };
}

/** Whole days between two calendar dates (UTC, so no DST edge cases). */
export function daysBetweenDates(a: CalendarDate, b: CalendarDate): number {
  return Math.round((toUTCDate(b).getTime() - toUTCDate(a).getTime()) / 86_400_000);
}

/** Due date of installment `n` (1-based), anchored on `firstPaymentDate`. */
export function dueDateForInstallment(firstPaymentDate: CalendarDate, n: number): CalendarDate {
  return addMonthsToDate(firstPaymentDate, n - 1);
}

/** Standard fixed-payment PMT. r <= 0 falls back to an even split. */
export function pmt(principal: number, annualRatePct: number, nMonths: number): number {
  if (nMonths <= 0) return principal;
  const r = annualRatePct / 100 / 12;
  if (r <= 0) return principal / nMonths;
  return (principal * r) / (1 - Math.pow(1 + r, -nMonths));
}

/** Finds the band covering installment `n`, validating full coverage up to termMonths. */
export function resolveBand(bands: RateBand[], n: number, termMonths: number): RateBand {
  const sorted = [...bands].sort((a, b) => a.fromInstallment - b.fromInstallment);
  for (const band of sorted) {
    const to = band.toInstallment ?? termMonths;
    if (n >= band.fromInstallment && n <= to) return band;
  }
  throw new Error(`ไม่มีขั้นดอกเบี้ยครอบคลุมงวดที่ ${n}`);
}

/** Latest reference-rate value effective on or before `due`. */
export function resolveReferenceRateValue(
  refCode: string,
  rates: ReferenceRate[],
  due: Date
): number {
  const applicable = rates.filter(
    (r) => r.code === refCode && r.effectiveFrom.getTime() <= due.getTime()
  );
  if (applicable.length === 0) {
    throw new Error(`ไม่มีอัตราอ้างอิง ${refCode} ที่มีผลก่อนวันที่ ${due.toISOString().slice(0, 10)}`);
  }
  return applicable.reduce((latest, r) =>
    r.effectiveFrom.getTime() > latest.effectiveFrom.getTime() ? r : latest
  ).value;
}

/** Effective annual rate for a band on a given due date. */
export function resolveRate(band: RateBand, rates: ReferenceRate[], due: Date): number {
  if (band.rateType === "absolute") return band.value;
  if (!band.refCode) throw new Error("ขั้นดอกเบี้ยแบบอ้างอิงต้องระบุ refCode");
  return resolveReferenceRateValue(band.refCode, rates, due) + band.value;
}

function prepaymentExtraAt(prepayments: Prepayment[], m: number): number {
  let sum = 0;
  for (const p of prepayments) {
    if (p.kind === "one_off") {
      if (p.fromInstallment === m) sum += p.amount;
    } else {
      const to = p.toInstallment ?? Infinity;
      if (m >= p.fromInstallment && m <= to) sum += p.amount;
    }
  }
  return sum;
}

export function buildSchedule(input: LoanInput): ScheduleResult {
  const {
    principal,
    termMonths,
    contractStart,
    bands,
    referenceRates = [],
    prepayments = [],
    interestMode = "monthly",
    actualPayments,
    maxMonths = termMonths * 2,
  } = input;
  const firstPaymentDate = input.firstPaymentDate ?? addMonthsToDate(contractStart, 1);

  let balance = principal;
  let payment = 0;
  let rateOfPreviousMonth: number | null = null;
  let cumulativeInterest = 0;
  let totalPaid = 0;
  let payoffMonths = maxMonths;
  let neverPaysOff = true;

  const rows: ScheduleRow[] = [];

  for (let m = 1; m <= maxMonths; m++) {
    const due = dueDateForInstallment(firstPaymentDate, m);
    const periodStart = m === 1 ? contractStart : dueDateForInstallment(firstPaymentDate, m - 1);
    const dueDate = toUTCDate(due);
    const bandLookupN = Math.min(m, termMonths);
    const band = resolveBand(bands, bandLookupN, termMonths);
    const rate = resolveRate(band, referenceRates, dueDate);

    const isBandStart = m === band.fromInstallment;
    const rateChanged = rateOfPreviousMonth !== null && rate !== rateOfPreviousMonth;

    if (band.paymentOverride != null) {
      payment = band.paymentOverride;
    } else if (payment === 0 || isBandStart || rateChanged) {
      payment = pmt(balance, rate, termMonths - m + 1);
    }
    rateOfPreviousMonth = rate;

    const actual = actualPayments?.get(m);
    const isActual = actual != null;
    const periodDays = daysBetweenDates(periodStart, due);
    // Installment #1 is a stub period whenever contractStart isn't exactly one
    // month before the first payment date — there's no sensible ÷12
    // equivalent for a partial period, so it always falls back to day-count,
    // even in "monthly" mode. Every later period is by construction exactly
    // one calendar month (dueDateForInstallment always advances by whole
    // months), so this never applies past installment #1.
    const isStubPeriod = m === 1 && !calendarDatesEqual(periodStart, addMonthsToDate(due, -1));
    const interest =
      interestMode === "daily" || isStubPeriod
        ? (balance * rate) / 100 * (periodDays / 365)
        : (balance * rate) / 100 / 12;
    const extra = isActual ? actual.extra : prepaymentExtraAt(prepayments, m);
    // `payment` is loop state carried forward for the next un-seeded
    // installment's PMT recompute (see isBandStart/rateChanged above) — never
    // overwrite it with a seeded row's recorded amount. `rowPayment` is only
    // what this row reports/pays.
    const rowPayment = isActual ? actual.payment : payment;
    const gross = rowPayment + extra;

    let cut = gross - interest;
    const negative = cut <= 0;
    if (cut > balance) cut = balance;
    const paidThisMonth = interest + cut;
    balance -= cut;
    if (Math.abs(balance) < 0.005) balance = 0;

    cumulativeInterest += interest;
    totalPaid += paidThisMonth;

    rows.push({
      installmentNumber: m,
      year: due.year,
      month: due.month,
      day: due.day,
      annualRate: rate,
      payment: rowPayment,
      extra,
      interest,
      principalPaid: cut,
      balance,
      cumulativeInterest,
      isBandStart,
      isActual,
      negativeAmortization: negative,
    });

    if (balance <= 0) {
      payoffMonths = m;
      neverPaysOff = false;
      break;
    }
    if (negative && m > termMonths) {
      payoffMonths = m;
      neverPaysOff = true;
      break;
    }
  }

  const last = rows[rows.length - 1];
  const payoffDate = dueDateForInstallment(firstPaymentDate, payoffMonths);
  const first3YearRows = rows.slice(0, Math.min(36, rows.length));
  const averageRateFirst3Years =
    first3YearRows.reduce((s, r) => s + r.annualRate, 0) / (first3YearRows.length || 1);

  return {
    rows,
    bands: summarizeBands(bands, rows, termMonths, principal),
    totalInterest: last ? last.cumulativeInterest : 0,
    totalPaid,
    payoffMonths,
    payoffYear: payoffDate.year,
    payoffMonth: payoffDate.month,
    neverPaysOff,
    hasNegativeAmortization: rows.some((r) => r.negativeAmortization),
    averageRateFirst3Years,
  };
}

function summarizeBands(
  bands: RateBand[],
  rows: ScheduleRow[],
  termMonths: number,
  principal: number
): BandSummary[] {
  const sorted = [...bands].sort((a, b) => a.fromInstallment - b.fromInstallment);
  const summaries: BandSummary[] = [];

  for (const band of sorted) {
    const to = band.toInstallment ?? termMonths;
    const bandRows = rows.filter(
      (r) => r.installmentNumber >= band.fromInstallment && r.installmentNumber <= to
    );
    if (bandRows.length === 0) continue;

    const firstRow = bandRows[0];
    const priorRow = rows.find((r) => r.installmentNumber === band.fromInstallment - 1);
    const openingBalance = priorRow ? priorRow.balance : principal;
    const closingBalance = bandRows[bandRows.length - 1].balance;

    summaries.push({
      label: band.label ?? `งวดที่ ${band.fromInstallment}–${to}`,
      fromInstallment: band.fromInstallment,
      toInstallment: to,
      annualRate: firstRow.annualRate,
      payment: firstRow.payment,
      interestInBand: bandRows.reduce((s, r) => s + r.interest, 0),
      principalInBand: bandRows.reduce((s, r) => s + r.principalPaid, 0),
      openingBalance,
      closingBalance,
    });
  }

  return summaries;
}

/**
 * Sensitivity of a single ref_spread band to its reference rate: how far the
 * reference rate can rise before the scheduled payment stops covering
 * interest (negative amortization), holding the payment fixed at whatever
 * the base schedule computed for that band.
 */
export function rateSensitivity(
  input: LoanInput,
  opts: { refCode: string; from: number; to: number; step: number; atInstallment?: number }
): SensitivityResult {
  const base = buildSchedule(input);
  const atInstallment =
    opts.atInstallment ??
    [...input.bands]
      .sort((a, b) => a.fromInstallment - b.fromInstallment)
      .find((b) => b.rateType === "ref_spread" && b.refCode === opts.refCode)?.fromInstallment;

  if (atInstallment == null) {
    return { points: [], criticalRefRate: null, headroom: null, balanceAtBandStart: null, payment: null };
  }

  const row = base.rows.find((r) => r.installmentNumber === atInstallment);
  if (!row) {
    return { points: [], criticalRefRate: null, headroom: null, balanceAtBandStart: null, payment: null };
  }

  const priorRow = base.rows.find((r) => r.installmentNumber === atInstallment - 1);
  const balanceAtBandStart = priorRow ? priorRow.balance : input.principal;
  // Total cash actually applied that month, not just the base scheduled
  // payment — a recurring prepayment with no end date keeps contributing
  // into this band too, and it's the total that determines whether interest
  // gets covered as the reference rate rises.
  const payment = row.payment + row.extra;
  const band = resolveBand(input.bands, Math.min(atInstallment, input.termMonths), input.termMonths);

  if (band.rateType !== "ref_spread" || !band.refCode) {
    return { points: [], criticalRefRate: null, headroom: null, balanceAtBandStart, payment };
  }
  const spread = band.value;
  const criticalRefRate = (payment * 12) / balanceAtBandStart * 100 - spread;

  const due = toUTCDate({ year: row.year, month: row.month, day: row.day });
  let headroom: number | null = null;
  try {
    const currentRefValue = resolveReferenceRateValue(band.refCode, input.referenceRates ?? [], due);
    headroom = criticalRefRate - currentRefValue;
  } catch {
    headroom = null;
  }

  const points: SensitivityPoint[] = [];
  for (let v = opts.from; v <= opts.to + 1e-9; v += opts.step) {
    const annualRate = v + spread;
    const monthlyInterest = (balanceAtBandStart * annualRate) / 100 / 12;
    points.push({ refRate: round2(v), annualRate: round2(annualRate), monthlyInterest, negative: payment <= monthlyInterest });
  }

  return { points, criticalRefRate, headroom, balanceAtBandStart, payment };
}
