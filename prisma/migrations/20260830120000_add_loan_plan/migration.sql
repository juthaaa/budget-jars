-- LoanPlan: a home/car loan with a stepped-rate schedule (fixed bands +
-- reference-rate linked bands, e.g. MRR/MLR/MOR ± spread) and optional
-- prepayment ("โปะ"). Generic across banks — see prisma/schema.prisma and
-- source/CLAUDE.md's "Loan Plan System" section.
--
-- Purely additive: four new tables plus one nullable column on
-- RecurringExpense with no default. No table rebuild, so this is safe to
-- replay onto Turso. (Hand-written instead of `prisma migrate diff` output —
-- diff generates a full RecurringExpense rebuild for the new column, which
-- would be unsafe to replay against the ~1,500 live rows already in
-- production.)

-- CreateTable
CREATE TABLE "LoanPlan" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "jarCode" TEXT NOT NULL,
    "paymentMethodId" INTEGER,
    "principalAmount" REAL NOT NULL,
    "termMonths" INTEGER NOT NULL,
    "startDate" DATETIME NOT NULL,
    "interestMode" TEXT NOT NULL DEFAULT 'monthly',
    "monthlyFeeAmount" REAL,
    "monthlyFeeMonths" INTEGER,
    "monthlyFeeRecurringExpenseId" INTEGER,
    "note" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LoanPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LoanPlan_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "PaymentMethod" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LoanReferenceRate" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "loanPlanId" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "value" REAL NOT NULL,
    "effectiveFrom" DATETIME NOT NULL,
    "isAssumption" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    CONSTRAINT "LoanReferenceRate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LoanReferenceRate_loanPlanId_fkey" FOREIGN KEY ("loanPlanId") REFERENCES "LoanPlan" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LoanRateBand" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "loanPlanId" INTEGER NOT NULL,
    "fromInstallment" INTEGER NOT NULL,
    "toInstallment" INTEGER,
    "rateType" TEXT NOT NULL,
    "refCode" TEXT,
    "value" REAL NOT NULL,
    "paymentOverride" REAL,
    "label" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "LoanRateBand_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LoanRateBand_loanPlanId_fkey" FOREIGN KEY ("loanPlanId") REFERENCES "LoanPlan" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LoanPrepayment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "loanPlanId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "fromInstallment" INTEGER NOT NULL,
    "toInstallment" INTEGER,
    "amount" REAL NOT NULL,
    "note" TEXT,
    CONSTRAINT "LoanPrepayment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LoanPrepayment_loanPlanId_fkey" FOREIGN KEY ("loanPlanId") REFERENCES "LoanPlan" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "LoanPlan_monthlyFeeRecurringExpenseId_key" ON "LoanPlan"("monthlyFeeRecurringExpenseId");

-- CreateIndex
CREATE INDEX "LoanPlan_userId_idx" ON "LoanPlan"("userId");

-- CreateIndex
CREATE INDEX "LoanReferenceRate_userId_idx" ON "LoanReferenceRate"("userId");

-- CreateIndex
CREATE INDEX "LoanReferenceRate_loanPlanId_code_effectiveFrom_idx" ON "LoanReferenceRate"("loanPlanId", "code", "effectiveFrom");

-- CreateIndex
CREATE INDEX "LoanRateBand_userId_idx" ON "LoanRateBand"("userId");

-- CreateIndex
CREATE INDEX "LoanRateBand_loanPlanId_fromInstallment_idx" ON "LoanRateBand"("loanPlanId", "fromInstallment");

-- CreateIndex
CREATE INDEX "LoanPrepayment_userId_idx" ON "LoanPrepayment"("userId");

-- CreateIndex
CREATE INDEX "LoanPrepayment_loanPlanId_fromInstallment_idx" ON "LoanPrepayment"("loanPlanId", "fromInstallment");

-- AlterTable
ALTER TABLE "RecurringExpense" ADD COLUMN "loanPlanId" INTEGER REFERENCES "LoanPlan" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
