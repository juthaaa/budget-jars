-- Marks an expense as a "รายการเบิก": paid through a real payment method (so it
-- still counts toward that method's total and the bank transfer), but excluded
-- from every jar's spent total because the money comes back later.
-- Hand-written rather than `prisma migrate diff` to avoid a full rebuild of
-- Expense, which holds live production rows.
ALTER TABLE "Expense" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'expense';
