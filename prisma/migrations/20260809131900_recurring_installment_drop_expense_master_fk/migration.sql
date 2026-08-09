-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_InstallmentPlan" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
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
    CONSTRAINT "InstallmentPlan_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "PaymentMethod" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_InstallmentPlan" ("id", "interestRate", "interestUnit", "jarCode", "name", "note", "paymentMethodId", "principalAmount", "sortOrder", "startDate", "totalInstallments") SELECT "id", "interestRate", "interestUnit", "jarCode", "name", "note", "paymentMethodId", "principalAmount", "sortOrder", "startDate", "totalInstallments" FROM "InstallmentPlan";
DROP TABLE "InstallmentPlan";
ALTER TABLE "new_InstallmentPlan" RENAME TO "InstallmentPlan";
CREATE TABLE "new_RecurringExpense" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
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
    CONSTRAINT "RecurringExpense_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "PaymentMethod" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "RecurringExpense_installmentPlanId_fkey" FOREIGN KEY ("installmentPlanId") REFERENCES "InstallmentPlan" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_RecurringExpense" ("amount", "endDate", "id", "installmentNumber", "installmentPlanId", "intervalUnit", "intervalValue", "jarCode", "name", "note", "paymentMethodId", "sortOrder", "startDate") SELECT "amount", "endDate", "id", "installmentNumber", "installmentPlanId", "intervalUnit", "intervalValue", "jarCode", "name", "note", "paymentMethodId", "sortOrder", "startDate" FROM "RecurringExpense";
DROP TABLE "RecurringExpense";
ALTER TABLE "new_RecurringExpense" RENAME TO "RecurringExpense";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
