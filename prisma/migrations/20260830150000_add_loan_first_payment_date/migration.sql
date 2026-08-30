-- Separates "วันที่เริ่มสัญญา" (LoanPlan.startDate, the disbursement date —
-- can now be any day of month, no longer forced to the 1st) from the due
-- date of installment #1 (firstPaymentDate). When they don't line up as
-- exactly one month apart, lib/loan-schedule.ts treats the gap as a stub
-- period and prorates its interest by actual days instead of the usual ÷12
-- approximation — see source/CLAUDE.md's "Loan Plan System" section.
--
-- Purely additive: one nullable column, no default, no table rebuild. Safe
-- to replay onto Turso.

-- AlterTable
ALTER TABLE "LoanPlan" ADD COLUMN "firstPaymentDate" DATETIME;
