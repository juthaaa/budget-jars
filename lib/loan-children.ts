// Shared recalculation of a LoanPlan's child RecurringExpense rows. Called
// from every write path that can change the schedule: POST (initial
// creation), PATCH (edit bands/rates/principal/etc.), and all three
// prepayment verbs. Putting it here instead of copy-pasting into each route
// (the InstallmentPlan feature's approach) is required once there are more
// than two call sites.
//
// Each installment owns up to two children, distinguished by
// loanItemKind: the scheduled payment ("installment") and, only when the
// plan's prepayment rules cover that month, the prepayment ("prepay"). They
// seed into a month as two separate Expense rows so a month where the
// borrower did not actually make the extra payment can have just that row
// deleted, without touching the scheduled payment.
//
// Freeze rule (mirrors the seeded-lock rule from
// app/api/installment-plans/[id]/route.ts, extended for the two-child
// split): once an installment's "installment" child has at least one linked
// Expense (expenses count greater than 0), the whole installment - both
// children - is historical and is never updated, renamed, created, or
// deleted here, no matter what the new schedule says. A "prepay" child is
// keyed off the same installmentNumber and only ever exists for a row that
// is not frozen yet, so checking the installment child's seeded state is
// enough to freeze both.
//
// Unlike the InstallmentPlan version, future rows are NOT recomputed from
// the original principal. They are computed by replaying the plan's actual
// billed history (actualPayments, built from the seeded installment/prepay
// children's own amounts) through lib/loan-schedule.ts, so the balance
// handed to the first un-seeded installment reflects what was really
// charged - an MRR change or a newly-recorded past prepayment can never
// retroactively falsify a month that already happened.
import { Prisma } from "@prisma/client";
import {
  buildSchedule,
  type ActualInstallment,
  type CalendarDate,
  type LoanInput,
  type Prepayment,
  type RateBand,
  type ReferenceRate,
} from "./loan-schedule";

function toCalendarDate(d: Date): CalendarDate {
  const utc = new Date(d);
  return { year: utc.getUTCFullYear(), month: utc.getUTCMonth() + 1, day: utc.getUTCDate() };
}

const round2 = (x: number) => Math.round(x * 100) / 100;

function chunksOf<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export interface RecalcResult {
  maxSeeded: number;
  updated: number;
  created: number;
  deleted: number;
}

/**
 * Recomputes and persists the un-seeded RecurringExpense children of a
 * LoanPlan. Must run inside the same transaction (tx) as any change to the
 * plan's own fields, bands, reference rates, or prepayments, since it reads
 * them back to build the schedule.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function recalcLoanChildren(tx: any, userId: number, planId: number): Promise<RecalcResult> {
  type ChildRow = {
    id: number;
    installmentNumber: number | null;
    loanItemKind: string | null;
    amount: number;
    _count: { expenses: number };
  };

  const plan = await tx.loanPlan.findFirst({
    where: { id: planId, userId },
    include: {
      bands: { orderBy: { fromInstallment: "asc" } },
      referenceRates: { orderBy: { effectiveFrom: "asc" } },
      prepayments: true,
      items: {
        include: { _count: { select: { expenses: true } } },
        orderBy: { installmentNumber: "asc" },
      },
    },
  });
  if (!plan) throw new Error("LoanPlan not found");

  const items: ChildRow[] = plan.items;
  const installmentByN = new Map<number, ChildRow>();
  const prepayByN = new Map<number, ChildRow>();
  for (const c of items) {
    if (c.installmentNumber == null) continue;
    if (c.loanItemKind === "prepay") prepayByN.set(c.installmentNumber, c);
    else installmentByN.set(c.installmentNumber, c); // "installment" or legacy null (pre-split rows)
  }

  // actualPayments only ever contains frozen (installment-seeded) rows - see
  // the freeze rule above. Its extra is the prepay child's own amount when
  // that child was also seeded, or 0 when the borrower recorded no
  // prepayment that month even though the plan's rules nominally cover it.
  const actualPayments = new Map<number, ActualInstallment>();
  let maxSeeded = 0;
  for (const [n, inst] of installmentByN) {
    if (inst._count.expenses === 0) continue;
    const prepay = prepayByN.get(n);
    const extra = prepay && prepay._count.expenses > 0 ? prepay.amount : 0;
    actualPayments.set(n, { payment: inst.amount, extra });
    maxSeeded = Math.max(maxSeeded, n);
  }

  const contractStart = toCalendarDate(plan.startDate);
  const firstPaymentDate = plan.firstPaymentDate ? toCalendarDate(plan.firstPaymentDate) : undefined;

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
    contractStart,
    firstPaymentDate,
    bands,
    referenceRates,
    prepayments,
    interestMode: plan.interestMode,
    actualPayments,
  };
  const schedule = buildSchedule(input);
  const maxRowN = schedule.rows.length ? schedule.rows[schedule.rows.length - 1].installmentNumber : 0;

  type NewChild = {
    userId: number;
    name: string;
    jarCode: string;
    amount: number;
    startDate: Date;
    endDate: Date;
    paymentMethodId: number | null;
    sortOrder: number;
    intervalValue: number;
    intervalUnit: string;
    loanPlanId: number;
    installmentNumber: number;
    loanItemKind: string;
  };
  const toCreate: NewChild[] = [];
  const stalePrepayIds: number[] = [];
  // Collected instead of awaited one-by-one: against a remote DB (Turso),
  // hundreds of sequential round trips inside one interactive transaction
  // can outrun Prisma's 5s transaction timeout on a long loan term. Applied
  // as a handful of batched CASE-based UPDATE statements after the loop.
  const toUpdate: { id: number; amount: number; date: Date; kind: string }[] = [];
  let updated = 0;
  let created = 0;

  for (const row of schedule.rows) {
    const n = row.installmentNumber;
    const instChild = installmentByN.get(n);
    const instSeeded = !!instChild && instChild._count.expenses > 0;
    if (instSeeded) continue; // frozen - never touch this installment's children

    // The seeding join in POST /api/months matches RecurringExpense rows by
    // startDate <= monthStart <= endDate where monthStart is always the
    // 1st of a month - so the persisted marker date is always day 1 of the
    // installment's due month (row.year/row.month), regardless of the real
    // due day (row.day, e.g. the 5th). The real day only matters for the
    // in-memory stub-period math and for display in the /schedule response.
    const d = new Date(Date.UTC(row.year, row.month - 1, 1));

    const instAmount = round2(row.payment);
    if (instChild) {
      toUpdate.push({ id: instChild.id, amount: instAmount, date: d, kind: "installment" });
      updated++;
    } else {
      toCreate.push({
        userId,
        name: plan.name,
        jarCode: plan.jarCode,
        amount: instAmount,
        startDate: d,
        endDate: d,
        paymentMethodId: plan.paymentMethodId,
        sortOrder: 0,
        intervalValue: 1,
        intervalUnit: "month",
        loanPlanId: planId,
        installmentNumber: n,
        loanItemKind: "installment",
      });
      created++;
    }

    // Prepay sibling. A seeded prepay child (rare: seeded independently of
    // its installment sibling via the month-page seed modal) is left alone
    // regardless of what the schedule now says.
    const prepayChild = prepayByN.get(n);
    const prepaySeeded = !!prepayChild && prepayChild._count.expenses > 0;
    if (prepaySeeded) continue;

    if (row.extra > 0) {
      const extraAmount = round2(row.extra);
      if (prepayChild) {
        toUpdate.push({ id: prepayChild.id, amount: extraAmount, date: d, kind: "prepay" });
        updated++;
      } else {
        toCreate.push({
          userId,
          name: `${plan.name} — โปะ`,
          jarCode: plan.jarCode,
          amount: extraAmount,
          startDate: d,
          endDate: d,
          paymentMethodId: plan.paymentMethodId,
          sortOrder: 1,
          intervalValue: 1,
          intervalUnit: "month",
          loanPlanId: planId,
          installmentNumber: n,
          loanItemKind: "prepay",
        });
        created++;
      }
    } else if (prepayChild) {
      // No extra payment due this month anymore (rule removed/shortened) -
      // the un-seeded prepay child is stale.
      stalePrepayIds.push(prepayChild.id);
    }
  }

  for (const chunk of chunksOf(toUpdate, 200)) {
    await tx.$executeRaw(Prisma.sql`
      UPDATE "RecurringExpense"
      SET
        amount = CASE id ${Prisma.join(
          chunk.map((u) => Prisma.sql`WHEN ${u.id} THEN ${u.amount}`),
          " "
        )} END,
        startDate = CASE id ${Prisma.join(
          chunk.map((u) => Prisma.sql`WHEN ${u.id} THEN ${u.date}`),
          " "
        )} END,
        endDate = CASE id ${Prisma.join(
          chunk.map((u) => Prisma.sql`WHEN ${u.id} THEN ${u.date}`),
          " "
        )} END,
        loanItemKind = CASE id ${Prisma.join(
          chunk.map((u) => Prisma.sql`WHEN ${u.id} THEN ${u.kind}`),
          " "
        )} END
      WHERE id IN (${Prisma.join(chunk.map((u) => u.id))})
    `);
  }

  for (const chunk of chunksOf(toCreate, 100)) {
    await tx.recurringExpense.createMany({ data: chunk });
  }

  // Anything beyond where the (possibly shortened, possibly extended)
  // schedule now ends, plus prepay children the loop above found stale, is
  // no longer applicable - delete it, unless it's already seeded.
  const staleIds = [
    ...items
      .filter((c) => c._count.expenses === 0 && (c.installmentNumber ?? 0) > maxRowN)
      .map((c) => c.id),
    ...stalePrepayIds,
  ];
  let deleted = 0;
  if (staleIds.length > 0) {
    const result = await tx.recurringExpense.deleteMany({
      where: { id: { in: staleIds }, expenses: { none: {} } },
    });
    deleted = result.count;
  }

  return { maxSeeded, updated, created, deleted };
}

/** installmentNumber of the highest already-seeded installment child, or 0 if none. */
export async function maxSeededInstallment(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: any,
  userId: number,
  planId: number
): Promise<number> {
  const items: { installmentNumber: number | null; loanItemKind: string | null; _count: { expenses: number } }[] =
    await tx.recurringExpense.findMany({
      where: { userId, loanPlanId: planId, loanItemKind: { not: "prepay" } },
      include: { _count: { select: { expenses: true } } },
    });
  return items.reduce(
    (max, c) => (c._count.expenses > 0 ? Math.max(max, c.installmentNumber ?? 0) : max),
    0
  );
}
