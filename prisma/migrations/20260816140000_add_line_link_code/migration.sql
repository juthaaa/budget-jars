-- One-shot code for linking a LINE account from the chat, so linking no longer
-- needs someone to run scripts/link-line-user.ts by hand.
-- Purely additive: no table rebuild, so this is safe to replay onto Turso.

-- AlterTable
ALTER TABLE "User" ADD COLUMN "lineLinkCode" TEXT;
ALTER TABLE "User" ADD COLUMN "lineLinkCodeExpiresAt" DATETIME;

-- CreateIndex
CREATE UNIQUE INDEX "User_lineLinkCode_key" ON "User"("lineLinkCode");
