-- Per-user data isolation: every table gains a required "userId" owned by User,
-- and codes that were globally unique become unique per user.
--
-- Backfill: this app was single-user until now, so every existing row is handed
-- to the oldest User row (MIN(id)). The NOT NULL column would reject the copy if
-- the User table were empty — create the login user before running this.

-- AlterTable
ALTER TABLE "User" ADD COLUMN "lineUserId" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_BankAccount" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "accountNumber" TEXT,
    "color" TEXT NOT NULL DEFAULT '#6366f1',
    CONSTRAINT "BankAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_BankAccount" ("userId", "accountNumber", "color", "id", "name") SELECT (SELECT MIN("id") FROM "User"), "accountNumber", "color", "id", "name" FROM "BankAccount";
DROP TABLE "BankAccount";
ALTER TABLE "new_BankAccount" RENAME TO "BankAccount";
CREATE INDEX "BankAccount_userId_idx" ON "BankAccount"("userId");
CREATE TABLE "new_DeductionRule" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "deductionTypeId" INTEGER NOT NULL,
    "valueType" TEXT NOT NULL DEFAULT 'amount',
    "value" REAL NOT NULL DEFAULT 0,
    "effectiveDate" DATETIME NOT NULL,
    CONSTRAINT "DeductionRule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DeductionRule_deductionTypeId_fkey" FOREIGN KEY ("deductionTypeId") REFERENCES "DeductionType" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_DeductionRule" ("userId", "deductionTypeId", "effectiveDate", "id", "value", "valueType") SELECT (SELECT MIN("id") FROM "User"), "deductionTypeId", "effectiveDate", "id", "value", "valueType" FROM "DeductionRule";
DROP TABLE "DeductionRule";
ALTER TABLE "new_DeductionRule" RENAME TO "DeductionRule";
CREATE INDEX "DeductionRule_userId_idx" ON "DeductionRule"("userId");
CREATE TABLE "new_DeductionType" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "DeductionType_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_DeductionType" ("userId", "code", "id", "name", "sortOrder") SELECT (SELECT MIN("id") FROM "User"), "code", "id", "name", "sortOrder" FROM "DeductionType";
DROP TABLE "DeductionType";
ALTER TABLE "new_DeductionType" RENAME TO "DeductionType";
CREATE INDEX "DeductionType_userId_idx" ON "DeductionType"("userId");
CREATE UNIQUE INDEX "DeductionType_userId_code_key" ON "DeductionType"("userId", "code");
CREATE TABLE "new_Expense" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "monthlyRecordId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "jarCode" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "bankAccountId" INTEGER,
    "note" TEXT,
    "expenseDate" DATETIME,
    "paymentMethodId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recurringExpenseId" INTEGER,
    CONSTRAINT "Expense_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Expense_monthlyRecordId_fkey" FOREIGN KEY ("monthlyRecordId") REFERENCES "MonthlyRecord" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Expense_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Expense_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "PaymentMethod" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Expense_recurringExpenseId_fkey" FOREIGN KEY ("recurringExpenseId") REFERENCES "RecurringExpense" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Expense" ("userId", "amount", "bankAccountId", "createdAt", "expenseDate", "id", "isLocked", "jarCode", "monthlyRecordId", "name", "note", "paymentMethodId", "recurringExpenseId") SELECT (SELECT MIN("id") FROM "User"), "amount", "bankAccountId", "createdAt", "expenseDate", "id", "isLocked", "jarCode", "monthlyRecordId", "name", "note", "paymentMethodId", "recurringExpenseId" FROM "Expense";
DROP TABLE "Expense";
ALTER TABLE "new_Expense" RENAME TO "Expense";
CREATE INDEX "Expense_userId_idx" ON "Expense"("userId");
CREATE TABLE "new_ExpenseMaster" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "defaultJarCode" TEXT,
    "bankAccountId" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "ExpenseMaster_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ExpenseMaster_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ExpenseMaster" ("userId", "bankAccountId", "defaultJarCode", "id", "name", "sortOrder") SELECT (SELECT MIN("id") FROM "User"), "bankAccountId", "defaultJarCode", "id", "name", "sortOrder" FROM "ExpenseMaster";
DROP TABLE "ExpenseMaster";
ALTER TABLE "new_ExpenseMaster" RENAME TO "ExpenseMaster";
CREATE INDEX "ExpenseMaster_userId_idx" ON "ExpenseMaster"("userId");
CREATE TABLE "new_IncomeType" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "excludeFromNet" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "IncomeType_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_IncomeType" ("userId", "code", "excludeFromNet", "id", "name", "sortOrder") SELECT (SELECT MIN("id") FROM "User"), "code", "excludeFromNet", "id", "name", "sortOrder" FROM "IncomeType";
DROP TABLE "IncomeType";
ALTER TABLE "new_IncomeType" RENAME TO "IncomeType";
CREATE INDEX "IncomeType_userId_idx" ON "IncomeType"("userId");
CREATE UNIQUE INDEX "IncomeType_userId_code_key" ON "IncomeType"("userId", "code");
CREATE TABLE "new_InstallmentPlan" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "jarCode" TEXT NOT NULL,
    "principalAmount" REAL NOT NULL,
    "totalInstallments" INTEGER NOT NULL,
    "interestRate" REAL NOT NULL DEFAULT 0,
    "interestUnit" TEXT NOT NULL DEFAULT 'month',
    "paymentMethodId" INTEGER,
    "startDate" DATETIME NOT NULL,
    "note" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "InstallmentPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InstallmentPlan_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "PaymentMethod" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_InstallmentPlan" ("userId", "id", "interestRate", "interestUnit", "jarCode", "name", "note", "paymentMethodId", "principalAmount", "sortOrder", "startDate", "totalInstallments") SELECT (SELECT MIN("id") FROM "User"), "id", "interestRate", "interestUnit", "jarCode", "name", "note", "paymentMethodId", "principalAmount", "sortOrder", "startDate", "totalInstallments" FROM "InstallmentPlan";
DROP TABLE "InstallmentPlan";
ALTER TABLE "new_InstallmentPlan" RENAME TO "InstallmentPlan";
CREATE INDEX "InstallmentPlan_userId_idx" ON "InstallmentPlan"("userId");
CREATE TABLE "new_Jar" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "jarType" TEXT NOT NULL DEFAULT 'a',
    "bankAccountId" INTEGER,
    "percentage" REAL NOT NULL DEFAULT 0,
    "rules" TEXT,
    "isNec" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "Jar_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Jar_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Jar" ("userId", "bankAccountId", "code", "id", "isNec", "jarType", "name", "percentage", "rules", "sortOrder") SELECT (SELECT MIN("id") FROM "User"), "bankAccountId", "code", "id", "isNec", "jarType", "name", "percentage", "rules", "sortOrder" FROM "Jar";
DROP TABLE "Jar";
ALTER TABLE "new_Jar" RENAME TO "Jar";
CREATE INDEX "Jar_userId_idx" ON "Jar"("userId");
CREATE UNIQUE INDEX "Jar_userId_code_key" ON "Jar"("userId", "code");
CREATE TABLE "new_JarAllocation" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "monthlyRecordId" INTEGER NOT NULL,
    "jarId" INTEGER NOT NULL,
    "amount" REAL NOT NULL DEFAULT 0,
    "percentage" REAL,
    "bankAccountId" INTEGER,
    CONSTRAINT "JarAllocation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "JarAllocation_monthlyRecordId_fkey" FOREIGN KEY ("monthlyRecordId") REFERENCES "MonthlyRecord" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "JarAllocation_jarId_fkey" FOREIGN KEY ("jarId") REFERENCES "Jar" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "JarAllocation_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_JarAllocation" ("userId", "amount", "bankAccountId", "id", "jarId", "monthlyRecordId", "percentage") SELECT (SELECT MIN("id") FROM "User"), "amount", "bankAccountId", "id", "jarId", "monthlyRecordId", "percentage" FROM "JarAllocation";
DROP TABLE "JarAllocation";
ALTER TABLE "new_JarAllocation" RENAME TO "JarAllocation";
CREATE INDEX "JarAllocation_userId_idx" ON "JarAllocation"("userId");
CREATE UNIQUE INDEX "JarAllocation_monthlyRecordId_jarId_key" ON "JarAllocation"("monthlyRecordId", "jarId");
CREATE TABLE "new_MonthlyBankTransfer" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "monthlyRecordId" INTEGER NOT NULL,
    "bankAccountId" INTEGER NOT NULL,
    "transferredAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MonthlyBankTransfer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MonthlyBankTransfer_monthlyRecordId_fkey" FOREIGN KEY ("monthlyRecordId") REFERENCES "MonthlyRecord" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MonthlyBankTransfer_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_MonthlyBankTransfer" ("userId", "bankAccountId", "createdAt", "id", "monthlyRecordId", "transferredAt", "updatedAt") SELECT (SELECT MIN("id") FROM "User"), "bankAccountId", "createdAt", "id", "monthlyRecordId", "transferredAt", "updatedAt" FROM "MonthlyBankTransfer";
DROP TABLE "MonthlyBankTransfer";
ALTER TABLE "new_MonthlyBankTransfer" RENAME TO "MonthlyBankTransfer";
CREATE INDEX "MonthlyBankTransfer_userId_idx" ON "MonthlyBankTransfer"("userId");
CREATE UNIQUE INDEX "MonthlyBankTransfer_monthlyRecordId_bankAccountId_key" ON "MonthlyBankTransfer"("monthlyRecordId", "bankAccountId");
CREATE TABLE "new_MonthlyDeduction" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "monthlyRecordId" INTEGER NOT NULL,
    "deductionTypeId" INTEGER NOT NULL,
    "amount" REAL NOT NULL DEFAULT 0,
    CONSTRAINT "MonthlyDeduction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MonthlyDeduction_monthlyRecordId_fkey" FOREIGN KEY ("monthlyRecordId") REFERENCES "MonthlyRecord" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MonthlyDeduction_deductionTypeId_fkey" FOREIGN KEY ("deductionTypeId") REFERENCES "DeductionType" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_MonthlyDeduction" ("userId", "amount", "deductionTypeId", "id", "monthlyRecordId") SELECT (SELECT MIN("id") FROM "User"), "amount", "deductionTypeId", "id", "monthlyRecordId" FROM "MonthlyDeduction";
DROP TABLE "MonthlyDeduction";
ALTER TABLE "new_MonthlyDeduction" RENAME TO "MonthlyDeduction";
CREATE INDEX "MonthlyDeduction_userId_idx" ON "MonthlyDeduction"("userId");
CREATE UNIQUE INDEX "MonthlyDeduction_monthlyRecordId_deductionTypeId_key" ON "MonthlyDeduction"("monthlyRecordId", "deductionTypeId");
CREATE TABLE "new_MonthlyIncome" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "monthlyRecordId" INTEGER NOT NULL,
    "incomeTypeId" INTEGER NOT NULL,
    "amount" REAL NOT NULL DEFAULT 0,
    CONSTRAINT "MonthlyIncome_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MonthlyIncome_monthlyRecordId_fkey" FOREIGN KEY ("monthlyRecordId") REFERENCES "MonthlyRecord" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MonthlyIncome_incomeTypeId_fkey" FOREIGN KEY ("incomeTypeId") REFERENCES "IncomeType" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_MonthlyIncome" ("userId", "amount", "id", "incomeTypeId", "monthlyRecordId") SELECT (SELECT MIN("id") FROM "User"), "amount", "id", "incomeTypeId", "monthlyRecordId" FROM "MonthlyIncome";
DROP TABLE "MonthlyIncome";
ALTER TABLE "new_MonthlyIncome" RENAME TO "MonthlyIncome";
CREATE INDEX "MonthlyIncome_userId_idx" ON "MonthlyIncome"("userId");
CREATE UNIQUE INDEX "MonthlyIncome_monthlyRecordId_incomeTypeId_key" ON "MonthlyIncome"("monthlyRecordId", "incomeTypeId");
CREATE TABLE "new_MonthlyPaymentSettlement" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "monthlyRecordId" INTEGER NOT NULL,
    "paymentMethodId" INTEGER NOT NULL,
    "paidAt" DATETIME,
    "reconciledAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MonthlyPaymentSettlement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MonthlyPaymentSettlement_monthlyRecordId_fkey" FOREIGN KEY ("monthlyRecordId") REFERENCES "MonthlyRecord" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MonthlyPaymentSettlement_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "PaymentMethod" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_MonthlyPaymentSettlement" ("userId", "createdAt", "id", "monthlyRecordId", "paidAt", "paymentMethodId", "reconciledAt", "updatedAt") SELECT (SELECT MIN("id") FROM "User"), "createdAt", "id", "monthlyRecordId", "paidAt", "paymentMethodId", "reconciledAt", "updatedAt" FROM "MonthlyPaymentSettlement";
DROP TABLE "MonthlyPaymentSettlement";
ALTER TABLE "new_MonthlyPaymentSettlement" RENAME TO "MonthlyPaymentSettlement";
CREATE INDEX "MonthlyPaymentSettlement_userId_idx" ON "MonthlyPaymentSettlement"("userId");
CREATE UNIQUE INDEX "MonthlyPaymentSettlement_monthlyRecordId_paymentMethodId_key" ON "MonthlyPaymentSettlement"("monthlyRecordId", "paymentMethodId");
CREATE TABLE "new_MonthlyRecord" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "necAmount" REAL NOT NULL DEFAULT 0,
    "necIsManual" BOOLEAN NOT NULL DEFAULT false,
    "reconciled" BOOLEAN NOT NULL DEFAULT false,
    "unassignedBankAccountId" INTEGER,
    CONSTRAINT "MonthlyRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MonthlyRecord_unassignedBankAccountId_fkey" FOREIGN KEY ("unassignedBankAccountId") REFERENCES "BankAccount" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_MonthlyRecord" ("userId", "id", "month", "necAmount", "necIsManual", "reconciled", "unassignedBankAccountId", "year") SELECT (SELECT MIN("id") FROM "User"), "id", "month", "necAmount", "necIsManual", "reconciled", "unassignedBankAccountId", "year" FROM "MonthlyRecord";
DROP TABLE "MonthlyRecord";
ALTER TABLE "new_MonthlyRecord" RENAME TO "MonthlyRecord";
CREATE INDEX "MonthlyRecord_userId_idx" ON "MonthlyRecord"("userId");
CREATE UNIQUE INDEX "MonthlyRecord_userId_year_month_key" ON "MonthlyRecord"("userId", "year", "month");
CREATE TABLE "new_PaymentMethod" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "bankAccountId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PaymentMethod_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PaymentMethod_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_PaymentMethod" ("userId", "bankAccountId", "code", "createdAt", "id", "name", "sortOrder") SELECT (SELECT MIN("id") FROM "User"), "bankAccountId", "code", "createdAt", "id", "name", "sortOrder" FROM "PaymentMethod";
DROP TABLE "PaymentMethod";
ALTER TABLE "new_PaymentMethod" RENAME TO "PaymentMethod";
CREATE INDEX "PaymentMethod_userId_idx" ON "PaymentMethod"("userId");
CREATE UNIQUE INDEX "PaymentMethod_userId_code_key" ON "PaymentMethod"("userId", "code");
CREATE TABLE "new_RecurringExpense" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "jarCode" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "startDate" DATETIME,
    "endDate" DATETIME,
    "paymentMethodId" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "intervalValue" INTEGER NOT NULL DEFAULT 1,
    "intervalUnit" TEXT NOT NULL DEFAULT 'month',
    "installmentPlanId" INTEGER,
    "installmentNumber" INTEGER,
    CONSTRAINT "RecurringExpense_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RecurringExpense_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "PaymentMethod" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "RecurringExpense_installmentPlanId_fkey" FOREIGN KEY ("installmentPlanId") REFERENCES "InstallmentPlan" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_RecurringExpense" ("userId", "amount", "endDate", "id", "installmentNumber", "installmentPlanId", "intervalUnit", "intervalValue", "jarCode", "name", "note", "paymentMethodId", "sortOrder", "startDate") SELECT (SELECT MIN("id") FROM "User"), "amount", "endDate", "id", "installmentNumber", "installmentPlanId", "intervalUnit", "intervalValue", "jarCode", "name", "note", "paymentMethodId", "sortOrder", "startDate" FROM "RecurringExpense";
DROP TABLE "RecurringExpense";
ALTER TABLE "new_RecurringExpense" RENAME TO "RecurringExpense";
CREATE INDEX "RecurringExpense_userId_idx" ON "RecurringExpense"("userId");
CREATE TABLE "new_SalaryHistory" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "effectiveDate" DATETIME NOT NULL,
    "amount" REAL NOT NULL,
    CONSTRAINT "SalaryHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_SalaryHistory" ("userId", "amount", "effectiveDate", "id") SELECT (SELECT MIN("id") FROM "User"), "amount", "effectiveDate", "id" FROM "SalaryHistory";
DROP TABLE "SalaryHistory";
ALTER TABLE "new_SalaryHistory" RENAME TO "SalaryHistory";
CREATE INDEX "SalaryHistory_userId_idx" ON "SalaryHistory"("userId");
CREATE TABLE "new_Transaction" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'line',
    "externalId" TEXT,
    "rawText" TEXT NOT NULL,
    "parsed" TEXT,
    "confidence" REAL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "direction" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "jarCode" TEXT,
    "note" TEXT,
    "paymentMethodCode" TEXT,
    "paymentMethodId" INTEGER,
    "bankAccountId" INTEGER,
    "occurredAt" DATETIME NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Transaction" ("userId", "amount", "bankAccountId", "confidence", "createdAt", "direction", "externalId", "id", "jarCode", "month", "name", "note", "occurredAt", "parsed", "paymentMethodCode", "paymentMethodId", "rawText", "source", "status", "updatedAt", "year") SELECT (SELECT MIN("id") FROM "User"), "amount", "bankAccountId", "confidence", "createdAt", "direction", "externalId", "id", "jarCode", "month", "name", "note", "occurredAt", "parsed", "paymentMethodCode", "paymentMethodId", "rawText", "source", "status", "updatedAt", "year" FROM "Transaction";
DROP TABLE "Transaction";
ALTER TABLE "new_Transaction" RENAME TO "Transaction";
CREATE UNIQUE INDEX "Transaction_externalId_key" ON "Transaction"("externalId");
CREATE INDEX "Transaction_userId_year_month_status_idx" ON "Transaction"("userId", "year", "month", "status");
CREATE INDEX "Transaction_userId_direction_occurredAt_idx" ON "Transaction"("userId", "direction", "occurredAt");
CREATE INDEX "Transaction_userId_idx" ON "Transaction"("userId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "User_lineUserId_key" ON "User"("lineUserId");
