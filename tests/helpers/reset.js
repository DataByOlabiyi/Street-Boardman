const prisma = require('../../server/config/db');

// Wipes every table between tests, in an order that respects foreign keys.
// These integration tests need a real Postgres database (DATABASE_URL in
// .env, migrated) — see docs/TESTING.md. Never point this at production.
async function resetDatabase() {
  await prisma.otpCode.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.dispute.deleteMany();
  await prisma.payout.deleteMany();
  await prisma.commission.deleteMany();
  await prisma.result.deleteMany();
  await prisma.bet.deleteMany();
  await prisma.betOption.deleteMany();
  await prisma.competitionParticipant.deleteMany();
  // Ledger entries/accounts (TASK-016/017) reference Wallet and Competition,
  // so they have to go before those. The EXTERNAL account is a permanent,
  // migration-seeded singleton (id: 'ledger-external-account') — kept
  // across tests rather than wiped, same as SystemSetting defaults aren't
  // meant to be per-test data. Its own entries ARE wiped, so each test
  // still starts from a zero balance on it.
  await prisma.ledgerEntry.deleteMany();
  await prisma.ledgerAccount.deleteMany({ where: { id: { not: 'ledger-external-account' } } });
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
