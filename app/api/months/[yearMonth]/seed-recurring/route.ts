import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isPaymentMethodLocked } from "@/lib/settlement-lock";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

function parseYearMonth(ym: string) {
  const [y, m] = ym.split("-");
  return { year: parseInt(y), month: parseInt(m) };
}

type RecurringRow = {
  id: number;
  name: string;
  jarCode: string;
  amount: number;
  paymentMethodId: number | null;
  installmentNumber: number | null;
  note: string | null;
  paymentMethod: { id: number; name: string } | null;
  installmentPlan: { note: string | null; totalInstallments: number } | null;
};

// Recurring items active in this month (by startDate/endDate window) that have not yet
// been seeded into it. No interval filter — every active, un-seeded item is a candidate.
async function findCandidates(recordId: number, monthStart: Date): Promise<RecurringRow[]> {
  const active: RecurringRow[] = await db.recurringExpense.findMany({
    where: {
      AND: [
        { OR: [{ startDate: null }, { startDate: { lte: monthStart } }] },
        { OR: [{ endDate: null }, { endDate: { gte: monthStart } }] },
      ],
    },
    include: {
      paymentMethod: { select: { id: true, name: true } },
      installmentPlan: { select: { note: true, totalInstallments: true } },
    },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });

  const seeded = await db.expense.findMany({
    where: { monthlyRecordId: recordId, recurringExpenseId: { not: null } },
    select: { recurringExpenseId: true },
  });
  const seededIds = new Set<number>(
    seeded.map((e: { recurringExpenseId: number | null }) => e.recurringExpenseId),
  );

  return active.filter((r) => !seededIds.has(r.id));
}

export async function GET(
  _req: Request,
  { params }: { params: { yearMonth: string } },
) {
  const { year, month } = parseYearMonth(params.yearMonth);
  const record = await prisma.monthlyRecord.findUnique({
    where: { year_month: { year, month } },
    select: { id: true },
  });
  if (!record) return NextResponse.json({ error: "Month not found" }, { status: 404 });

  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const candidates = await findCandidates(record.id, monthStart);

  return NextResponse.json(
    candidates.map((r) => ({
      id: r.id,
      name: r.name,
      jarCode: r.jarCode,
      amount: r.amount,
      paymentMethodId: r.paymentMethod?.id ?? null,
      paymentMethodName: r.paymentMethod?.name ?? null,
      note: r.note ?? r.installmentPlan?.note ?? null,
      installmentNumber: r.installmentNumber,
      totalInstallments: r.installmentPlan?.totalInstallments ?? null,
    })),
  );
}

export async function POST(
  request: Request,
  { params }: { params: { yearMonth: string } },
) {
  const { year, month } = parseYearMonth(params.yearMonth);
  const record = await prisma.monthlyRecord.findUnique({
    where: { year_month: { year, month } },
    select: { id: true },
  });
  if (!record) return NextResponse.json({ error: "Month not found" }, { status: 404 });

  const body = await request.json();
  const ids: number[] = Array.isArray(body.ids)
    ? body.ids.map((v: unknown) => Number(v)).filter((v: number) => Number.isFinite(v))
    : [];
  if (ids.length === 0) {
    return NextResponse.json({ error: "ไม่มีรายการที่จะเพิ่ม" }, { status: 400 });
  }

  // Re-derive candidates server-side so we never seed an item that is already present
  // or not active this month, regardless of what ids the client sent.
  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const candidates = await findCandidates(record.id, monthStart);
  const requested = new Set(ids);
  const toSeed = candidates.filter((r) => requested.has(r.id));

  // Skip items whose payment method is reconciled (locked); report which were skipped.
  const lockCache = new Map<number | null, boolean>();
  const seedable: RecurringRow[] = [];
  let skippedLocked = 0;
  for (const r of toSeed) {
    const pmId = r.paymentMethodId ?? null;
    let locked = lockCache.get(pmId);
    if (locked === undefined) {
      locked = await isPaymentMethodLocked(record.id, pmId);
      lockCache.set(pmId, locked);
    }
    if (locked) {
      skippedLocked++;
      continue;
    }
    seedable.push(r);
  }

  if (seedable.length > 0) {
    await db.expense.createMany({
      data: seedable.map((r) => ({
        monthlyRecordId: record.id,
        name: r.name,
        jarCode: r.jarCode,
        amount: r.amount,
        paymentMethodId: r.paymentMethodId,
        bankAccountId: null,
        note: r.note ?? r.installmentPlan?.note ?? null,
        recurringExpenseId: r.id,
      })),
    });
  }

  return NextResponse.json({ created: seedable.length, skippedLocked });
}
