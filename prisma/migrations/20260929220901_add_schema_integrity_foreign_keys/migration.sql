-- AddForeignKey
ALTER TABLE "Bet" ADD CONSTRAINT "Bet_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Result" ADD CONSTRAINT "Result_winningOptionId_fkey" FOREIGN KEY ("winningOptionId") REFERENCES "BetOption"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Commission" ADD CONSTRAINT "Commission_boardmanId_fkey" FOREIGN KEY ("boardmanId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CheckConstraint (TASK-013): the database itself rejects a negative
-- balance even if application code has a bug, on top of the conditional
-- update in walletService.applyWalletTransaction that's supposed to
-- prevent one from ever being written.
ALTER TABLE "Wallet" ADD CONSTRAINT "wallet_balance_non_negative" CHECK (balance >= 0);
