-- CreateTable
CREATE TABLE "Transaction" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
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
    "paymentMethodId" INTEGER,
    "bankAccountId" INTEGER,
    "occurredAt" DATETIME NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_externalId_key" ON "Transaction"("externalId");

-- CreateIndex
CREATE INDEX "Transaction_year_month_status_idx" ON "Transaction"("year", "month", "status");

-- CreateIndex
CREATE INDEX "Transaction_direction_occurredAt_idx" ON "Transaction"("direction", "occurredAt");
