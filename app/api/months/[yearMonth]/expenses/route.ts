import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isPaymentMethodLocked } from "@/lib/settlement-lock";
import { badReference, currentUserId, unauthorized } from "@/lib/auth";
import { owns } from "@/lib/ownership";
import { normalizeExpenseKind } from "@/lib/expense-kind";

function parseYearMonth(ym: string) {
  const [y, m] = ym.split("-");
  return { year: parseInt(y), month: parseInt(m) };
}

export async function POST(
  request: Request,
  { params }: { params: { yearMonth: string } }
) {
  const userId = await currentUserId();
  if (userId === null) return unauthorized();

  const { year, month } = parseYearMonth(params.yearMonth);
  const body = await request.json();

  const record = await prisma.monthlyRecord.findUnique({
    where: { userId_year_month: { userId, year, month } },
  });
  if (!record) return NextResponse.json({ error: "Month not found" }, { status: 404 });

  // Accept either a single expense object or a bulk `{ items: [...] }` payload.
  const rawItems = Array.isArray(body.items) ? body.items : [body];
  const items = rawItems.filter(
    (it: { name?: string; amount?: unknown }) =>
      it && it.name && String(it.name).trim() && it.amount !== "" && it.amount != null,
  );
  if (items.length === 0) {
    return NextResponse.json({ error: "ไม่มีรายการที่จะบันทึก" }, { status: 400 });
  }

  // Validate payment-method locks once per distinct payment method.
  const distinctPmIds = [
    ...new Set(items.map((it: { paymentMethodId?: number | null }) => it.paymentMethodId ?? null)),
  ] as (number | null)[];
  for (const pmId of distinctPmIds) {
    if (!(await owns(userId, "paymentMethod", pmId))) return badReference();
    if (await isPaymentMethodLocked(record.id, pmId)) {
      return NextResponse.json(
        { error: "Payment method ถูกตรวจสอบแล้ว ไม่สามารถเพิ่มรายการได้" },
        { status: 403 },
      );
    }
  }

  const distinctBankIds = [
    ...new Set(items.map((it: { bankAccountId?: number | null }) => it.bankAccountId || null)),
  ] as (number | null)[];
  for (const bankId of distinctBankIds) {
    if (!(await owns(userId, "bankAccount", bankId))) return badReference();
  }

  const created = await prisma.$transaction(
    items.map((it: {
      name: string; jarCode: string; amount: string | number;
      bankAccountId?: number | null; note?: string | null;
      expenseDate?: string | null; paymentMethodId?: number | null;
      kind?: string;
    }) => {
      const { kind, jarCode } = normalizeExpenseKind(it.kind, it.jarCode);
      return prisma.expense.create({
        data: {
          userId,
          monthlyRecordId: record.id,
          name: it.name,
          jarCode,
          kind,
          amount: parseFloat(String(it.amount)),
          bankAccountId: it.bankAccountId || null,
          note: it.note || null,
          expenseDate: it.expenseDate ? new Date(it.expenseDate) : null,
          paymentMethodId: it.paymentMethodId ?? null,
        },
        include: { bankAccount: true, paymentMethod: { select: { id: true, name: true } } },
      });
    }),
  );

  // Single-object callers expect a single record; bulk callers get the array.
  return NextResponse.json(Array.isArray(body.items) ? created : created[0], { status: 201 });
}
