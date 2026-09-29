-- AlterTable
ALTER TABLE "Competition" ADD COLUMN     "lastPayoutError" TEXT,
ADD COLUMN     "payoutAttemptCount" INTEGER NOT NULL DEFAULT 0;
