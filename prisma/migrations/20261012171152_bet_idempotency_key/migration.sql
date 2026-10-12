-- AlterTable
ALTER TABLE "Bet" ADD COLUMN     "idempotencyKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Bet_betterId_idempotencyKey_key" ON "Bet"("betterId", "idempotencyKey");

