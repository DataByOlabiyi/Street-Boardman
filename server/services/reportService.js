const prisma = require('../config/db');
const AppError = require('../utils/appError');

// Admin reports (FEAT-046): what moved through the platform in a period.
// Money figures come from the wallet ledger, the same source the daily
// reconciliation checks, so a report can't disagree with the balances.
// Days are bucketed in Lagos time, which is how the business reads them.
const MAX_RANGE_DAYS = 366;
const DAY_MS = 24 * 60 * 60 * 1000;
const TZ = 'Africa/Lagos';

function resolveRange({ from, to }) {
  const end = to ? new Date(to) : new Date();
  const start = from ? new Date(from) : new Date(end.getTime() - 30 * DAY_MS);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) throw new AppError('Invalid date range', 422);
  if (start >= end) throw new AppError('`from` must be before `to`', 422);
  if (end - start > MAX_RANGE_DAYS * DAY_MS) throw new AppError(`Reports cover at most ${MAX_RANGE_DAYS} days`, 422);
  return { start, end };
}

const money = (value) => Number(value || 0).toFixed(2);

async function summary({ from, to, groupBy } = {}) {
  const { start, end } = resolveRange({ from, to });
  const inRange = { gte: start, lt: end };

  const [deposits, paidOut, failedOut, outstanding, bets, bettors, ledger, competitions, newUsers] = await Promise.all([
    prisma.deposit.aggregate({ where: { status: 'SUCCESSFUL', createdAt: inRange }, _sum: { amount: true }, _count: true }),
    prisma.withdrawal.aggregate({ where: { status: 'PROCESSED', processedAt: inRange }, _sum: { amount: true }, _count: true }),
    prisma.withdrawal.count({ where: { status: 'FAILED', processedAt: inRange } }),
    prisma.withdrawal.aggregate({ where: { status: { in: ['PENDING', 'PROCESSING'] } }, _sum: { amount: true }, _count: true }),
    prisma.bet.aggregate({ where: { placedAt: inRange }, _sum: { stake: true }, _count: true }),
    prisma.bet.groupBy({ by: ['betterId'], where: { placedAt: inRange } }),
    prisma.$queryRaw`
      SELECT t.type::text AS type, w."walletType"::text AS "walletType", SUM(t.amount) AS total, COUNT(*)::int AS count
      FROM "WalletTransaction" t JOIN "Wallet" w ON w.id = t."walletId"
      WHERE t."createdAt" >= ${start} AND t."createdAt" < ${end}
      GROUP BY 1, 2`,
    prisma.competition.groupBy({ by: ['status'], where: { createdAt: inRange }, _count: true }),
    prisma.user.groupBy({ by: ['role'], where: { createdAt: inRange }, _count: true }),
  ]);

  const ledgerSum = (type, walletType) =>
    ledger
      .filter((r) => r.type === type && (!walletType || r.walletType === walletType))
      .reduce((sum, r) => sum + Number(r.total), 0);

  const report = {
    range: { from: start.toISOString(), to: end.toISOString(), timezone: TZ },
    deposits: { count: deposits._count, total: money(deposits._sum.amount) },
    withdrawals: {
      paidCount: paidOut._count,
      paidTotal: money(paidOut._sum.amount),
      failedCount: failedOut,
      outstandingCount: outstanding._count,
      outstandingTotal: money(outstanding._sum.amount),
    },
    betting: { bets: bets._count, staked: money(bets._sum.stake), uniqueBettors: bettors.length },
    payouts: {
      winnings: money(ledgerSum('BET_WIN')),
      refunds: money(ledgerSum('REFUND')),
    },
    commission: {
      platform: money(ledgerSum('COMMISSION', 'PLATFORM')),
      boardmen: money(ledgerSum('COMMISSION', 'BOARDMAN')),
    },
    manualAdjustments: money(ledgerSum('ADJUSTMENT')),
    competitionsCreated: Object.fromEntries(competitions.map((c) => [c.status, c._count])),
    newUsers: Object.fromEntries(newUsers.map((u) => [u.role, u._count])),
  };

  if (groupBy === 'day') report.daily = await dailySeries(start, end);
  return report;
}

// One row per Lagos day that had activity: stakes, winnings, platform
// commission, deposits and withdrawal requests, all from the wallet ledger.
async function dailySeries(start, end) {
  const rows = await prisma.$queryRaw`
    SELECT to_char(date_trunc('day', (t."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${TZ}), 'YYYY-MM-DD') AS day,
      SUM(CASE WHEN t.type = 'BET_STAKE' THEN -t.amount ELSE 0 END) AS staked,
      SUM(CASE WHEN t.type = 'BET_WIN' THEN t.amount ELSE 0 END) AS winnings,
      SUM(CASE WHEN t.type = 'COMMISSION' AND w."walletType" = 'PLATFORM' THEN t.amount ELSE 0 END) AS "platformCommission",
      SUM(CASE WHEN t.type = 'DEPOSIT' THEN t.amount ELSE 0 END) AS deposits,
      SUM(CASE WHEN t.type = 'WITHDRAWAL' THEN -t.amount ELSE 0 END) AS "withdrawalsRequested"
    FROM "WalletTransaction" t JOIN "Wallet" w ON w.id = t."walletId"
    WHERE t."createdAt" >= ${start} AND t."createdAt" < ${end}
    GROUP BY 1 ORDER BY 1`;
  return rows.map((r) => ({
    day: r.day,
    staked: money(r.staked),
    winnings: money(r.winnings),
    platformCommission: money(r.platformCommission),
    deposits: money(r.deposits),
    withdrawalsRequested: money(r.withdrawalsRequested),
  }));
}

module.exports = { summary, MAX_RANGE_DAYS };
