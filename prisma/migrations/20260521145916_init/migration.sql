-- CreateTable
CREATE TABLE "BankAccount" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "accountNumber" TEXT,
    "color" TEXT NOT NULL DEFAULT '#6366f1'
);

-- CreateTable
CREATE TABLE "Jar" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "jarType" TEXT NOT NULL DEFAULT 'a',
    "bankAccountId" INTEGER,
    "percentage" REAL NOT NULL DEFAULT 0,
    "rules" TEXT,
    "isNec" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "Jar_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MonthlyRecord" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "salary" REAL NOT NULL DEFAULT 0,
    "ot" REAL NOT NULL DEFAULT 0,
    "bonus" REAL NOT NULL DEFAULT 0,
    "grossIncome" REAL NOT NULL DEFAULT 0,
    "taxWithheld" REAL NOT NULL DEFAULT 0,
    "netIncome" REAL NOT NULL DEFAULT 0,
    "necAmount" REAL NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "JarAllocation" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "monthlyRecordId" INTEGER NOT NULL,
    "jarId" INTEGER NOT NULL,
    "amount" REAL NOT NULL DEFAULT 0,
    CONSTRAINT "JarAllocation_monthlyRecordId_fkey" FOREIGN KEY ("monthlyRecordId") REFERENCES "MonthlyRecord" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "JarAllocation_jarId_fkey" FOREIGN KEY ("jarId") REFERENCES "Jar" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "monthlyRecordId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "jarCode" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "bankAccountId" INTEGER,
    "note" TEXT,
    "expenseDate" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Expense_monthlyRecordId_fkey" FOREIGN KEY ("monthlyRecordId") REFERENCES "MonthlyRecord" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Expense_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SalaryHistory" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "effectiveDate" DATETIME NOT NULL,
    "amount" REAL NOT NULL,
    "increaseAmount" REAL,
    "increasePercent" REAL
);

-- CreateIndex
CREATE UNIQUE INDEX "Jar_code_key" ON "Jar"("code");

-- CreateIndex
CREATE UNIQUE INDEX "MonthlyRecord_year_month_key" ON "MonthlyRecord"("year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "JarAllocation_monthlyRecordId_jarId_key" ON "JarAllocation"("monthlyRecordId", "jarId");
