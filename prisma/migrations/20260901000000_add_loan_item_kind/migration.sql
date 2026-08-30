-- Splits a loan installment's child RecurringExpense into two roles:
-- the scheduled payment ("installment") and the prepayment ("prepay"), so a
-- month can seed them as separate Expense rows and one can be deleted (the
-- borrower skipped โปะ that month) without touching the other.
ALTER TABLE "RecurringExpense" ADD COLUMN "loanItemKind" TEXT;

-- Backfill: every existing loan child so far is a scheduled-payment row
-- (prepayments were folded into `amount`, not split out) — label only, no
-- amounts touched.
UPDATE "RecurringExpense" SET "loanItemKind" = 'installment' WHERE "loanPlanId" IS NOT NULL;
