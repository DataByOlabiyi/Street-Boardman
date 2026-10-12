// Money invariants, checked straight against the database (FEAT-054
// failure drills). Run after anything that could have interrupted money
// moving: a crash, a restart, a restore.
//
//   DATABASE_URL=... node scripts/verify-money.js
//   docker compose run --rm migrate node scripts/verify-money.js
//
// Prints one JSON report and exits 1 if any invariant is broken. Each check
// counts violating rows, so it stays fast on large databases.
const { createPrismaClient } = require('../server/utils/prismaClient');

const CHECKS = {
  // A wallet's stored balance equals what its ledger account says.
  walletMatchesLedger: `
    SELECT COUNT(*)::int AS n FROM "Wallet" w
    LEFT JOIN "LedgerAccount" a ON a."walletId" = w.id
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(CASE WHEN e.direction = 'CREDIT' THEN e.amount ELSE -e.amount END), 0) AS bal
      FROM "LedgerEntry" e WHERE e."accountId" = a.id
    ) l ON true
    WHERE w.balance <> COALESCE(l.bal, 0)`,
  noNegativeWallets: `SELECT COUNT(*)::int AS n FROM "Wallet" WHERE balance < 0`,
  // Double entry: every posting group nets to zero.
  ledgerGroupsBalance: `
    SELECT COUNT(*)::int AS n FROM (
      SELECT "groupId" FROM "LedgerEntry" GROUP BY "groupId"
      HAVING SUM(CASE WHEN direction = 'CREDIT' THEN amount ELSE -amount END) <> 0) g`,
  // Every bet took its stake exactly once.
  everyBetStakedOnce: `
    SELECT COUNT(*)::int AS n FROM "Bet" b
    WHERE (SELECT COUNT(*) FROM "WalletTransaction" t
           WHERE t."referenceType" = 'Bet' AND t."referenceId" = b.id AND t.type = 'BET_STAKE') <> 1`,
  // Winners paid exactly once; nobody else paid. Wins are recorded
  // against the bet's Payout row.
  winnersPaidOnce: `
    SELECT COUNT(*)::int AS n FROM "Bet" b
    WHERE (SELECT COUNT(*) FROM "Payout" p JOIN "WalletTransaction" t
             ON t."referenceType" = 'Payout' AND t."referenceId" = p.id AND t.type = 'BET_WIN'
           WHERE p."betId" = b.id)
          <> CASE WHEN b.status = 'WON' THEN 1 ELSE 0 END`,
  refundsOnce: `
    SELECT COUNT(*)::int AS n FROM "Bet" b
    WHERE (SELECT COUNT(*) FROM "WalletTransaction" t
           WHERE t."referenceType" = 'Bet' AND t."referenceId" = b.id AND t.type = 'REFUND')
          <> CASE WHEN b.status = 'REFUNDED' THEN 1 ELSE 0 END`,
  // The sharded option totals agree with the bets placed (TASK-048).
  optionTotalsMatchBets: `
    SELECT COUNT(*)::int AS n FROM "BetOption" o
    WHERE COALESCE((SELECT SUM("totalStaked") FROM "BetOptionShard" s WHERE s."betOptionId" = o.id), 0)
       <> COALESCE((SELECT SUM(stake) FROM "Bet" b WHERE b."betOptionId" = o.id), 0)`,
  // A settled competition's escrow is empty: everything staked went out
  // as winnings, commission or refunds.
  settledEscrowEmpty: `
    SELECT COUNT(*)::int AS n FROM "Competition" c
    JOIN "LedgerAccount" a ON a."competitionId" = c.id
    WHERE c.status IN ('COMPLETED', 'CANCELLED_REFUNDED')
      AND (SELECT COALESCE(SUM(CASE WHEN e.direction = 'CREDIT' THEN e.amount ELSE -e.amount END), 0)
           FROM "LedgerEntry" e WHERE e."accountId" = a.id) <> 0`,
  // Nothing left half-way: no competition stuck mid-payout.
  noStuckPayouts: `SELECT COUNT(*)::int AS n FROM "Competition" WHERE status = 'PAYOUT_PROCESSING'`,
};

async function verifyMoney(prisma) {
  const results = {};
  for (const [name, sql] of Object.entries(CHECKS)) {
    const [row] = await prisma.$queryRawUnsafe(sql);
    results[name] = row.n;
  }
  const [counts] = await prisma.$queryRawUnsafe(`
    SELECT (SELECT COUNT(*) FROM "Bet")::int AS bets, (SELECT COUNT(*) FROM "Wallet")::int AS wallets,
           (SELECT COUNT(*) FROM "Competition" WHERE status = 'COMPLETED')::int AS completed`);
  const failed = Object.entries(results).filter(([, n]) => n !== 0).map(([name]) => name);
  return { ok: failed.length === 0, failed, violations: results, counts };
}

module.exports = { verifyMoney, CHECKS };

if (require.main === module) {
  const prisma = createPrismaClient(process.env.DATABASE_URL);
  verifyMoney(prisma)
    .then((report) => {
      process.stdout.write(`${JSON.stringify(report)}\n`);
      process.exitCode = report.ok ? 0 : 1;
    })
    .catch((err) => {
      process.stderr.write(`verify-money failed to run: ${err.message}\n`);
      process.exitCode = 2;
    })
    .finally(() => prisma.$disconnect());
}
