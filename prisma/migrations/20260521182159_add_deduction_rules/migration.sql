-- CreateTable
CREATE TABLE "DeductionRule" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "valueType" TEXT NOT NULL DEFAULT 'amount',
    "value" REAL NOT NULL DEFAULT 0,
    "effectiveDate" DATETIME NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_MonthlyRecord" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "salary" REAL NOT NULL DEFAULT 0,
    "ot" REAL NOT NULL DEFAULT 0,
    "bonus" REAL NOT NULL DEFAULT 0,
    "grossIncome" REAL NOT NULL DEFAULT 0,
    "providentFund" REAL NOT NULL DEFAULT 0,
    "socialSecurity" REAL NOT NULL DEFAULT 0,
    "incomeTax" REAL NOT NULL DEFAULT 0,
    "taxWithheld" REAL NOT NULL DEFAULT 0,
    "netIncome" REAL NOT NULL DEFAULT 0,
    "necAmount" REAL NOT NULL DEFAULT 0
);
INSERT INTO "new_MonthlyRecord" ("bonus", "grossIncome", "id", "month", "necAmount", "netIncome", "ot", "salary", "taxWithheld", "year") SELECT "bonus", "grossIncome", "id", "month", "necAmount", "netIncome", "ot", "salary", "taxWithheld", "year" FROM "MonthlyRecord";
DROP TABLE "MonthlyRecord";
ALTER TABLE "new_MonthlyRecord" RENAME TO "MonthlyRecord";
CREATE UNIQUE INDEX "MonthlyRecord_year_month_key" ON "MonthlyRecord"("year", "month");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
