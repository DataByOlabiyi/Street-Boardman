const prisma = require('../../server/config/db');

// Wipes every table between tests, in an order that respects foreign keys.
// These integration tests need a real Postgres database (DATABASE_URL in
// .env, migrated) — see docs/TESTING.md. Never point this at production.
async function resetDatabase() {
  await prisma.auditLog.deleteMany();
  await prisma.dispute.deleteMany();
  await prisma.payout.deleteMany();
  await prisma.commission.deleteMany();
  await prisma.result.deleteMany();
  await prisma.bet.deleteMany();
  await prisma.betOption.deleteMany();
  await prisma.competitionParticipant.deleteMany();
  await prisma.competition.deleteMany();
  await prisma.boardmanProfile.deleteMany();
  await prisma.withdrawal.deleteMany();
  await prisma.deposit.deleteMany();
  await prisma.walletTransaction.deleteMany();
  await prisma.wallet.deleteMany();
  await prisma.user.deleteMany();
  await prisma.systemSetting.deleteMany();
}

module.exports = { resetDatabase, prisma };
