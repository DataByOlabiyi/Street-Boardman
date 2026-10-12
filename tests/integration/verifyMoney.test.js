// scripts/verify-money.js: the invariant checker the failure drills run
// (FEAT-054). It must pass on healthy data and catch each kind of damage.
const { resetDatabase, prisma } = require('../helpers/reset');
const { resetAuthLimiter, approvedBoardman, fundedBetter, openCompetition } = require('../helpers/fixtures');
const resultService = require('../../server/services/resultService');
const payoutService = require('../../server/services/payoutService');
const { verifyMoney } = require('../../scripts/verify-money');

beforeEach(async () => {
  await resetDatabase();
  await resetAuthLimiter();
});

afterAll(async () => {
  await prisma.$disconnect();
});

// One competition paid out, one cancelled with refunds.
async function settledHistory() {
  const bm = await approvedBoardman();
  const paid = await openCompetition(bm, 'Paid out');
  const cancelled = await openCompetition(bm, 'Called off');
  const b1 = await fundedBetter(10000);
  const b2 = await fundedBetter(10000);
  await b1.agent.post('/api/bets').send({ betOptionId: paid.betOptions[0].id, stake: 3000 });
  await b2.agent.post('/api/bets').send({ betOptionId: paid.betOptions[1].id, stake: 2000 });
  await b2.agent.post('/api/bets').send({ betOptionId: cancelled.betOptions[0].id, stake: 1000 });

  await bm.agent.patch(`/api/competitions/${paid.id}/close-betting`);
  const profile = await prisma.boardmanProfile.findUnique({ where: { id: bm.profileId } });
  await resultService.submitResult(profile, paid.id, { winningOptionId: paid.betOptions[0].id });
  await prisma.competition.update({ where: { id: paid.id }, data: { status: 'RESULT_CONFIRMED' } });
  await payoutService.processPayoutsForCompetition(paid.id);
  await bm.agent.post(`/api/competitions/${cancelled.id}/cancel`).send({ reason: 'Rain stopped play' });
  return { b1, b2, paid };
}

describe('verify-money', () => {
  it('passes on a healthy history of bets, payouts and refunds', async () => {
    await settledHistory();
    const report = await verifyMoney(prisma);
    expect(report.failed).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.counts).toMatchObject({ bets: 3, completed: 1 });
  });

  it('catches a balance edited outside the ledger', async () => {
    const { b1 } = await settledHistory();
    await prisma.$executeRaw`UPDATE "Wallet" SET balance = balance + 1 WHERE "userId" = ${b1.userId}`;
    expect((await verifyMoney(prisma)).failed).toEqual(['walletMatchesLedger']);
  });

  it('catches a winner paid twice and a payout left half-way', async () => {
    const { b1, paid } = await settledHistory();
    const win = await prisma.walletTransaction.findFirst({ where: { type: 'BET_WIN', wallet: { userId: b1.userId } } });
    await prisma.walletTransaction.create({ data: { ...win, id: undefined, createdAt: undefined } });
    await prisma.competition.update({ where: { id: paid.id }, data: { status: 'PAYOUT_PROCESSING' } });

    const report = await verifyMoney(prisma);
    expect(report.failed).toEqual(expect.arrayContaining(['winnersPaidOnce', 'noStuckPayouts']));
    expect(report.ok).toBe(false);
  });

  it('catches option totals that drifted from the bets', async () => {
    const { paid } = await settledHistory();
    await prisma.betOptionShard.create({ data: { betOptionId: paid.betOptions[0].id, shard: 99, totalStaked: 5 } });
    expect((await verifyMoney(prisma)).failed).toEqual(['optionTotalsMatchBets']);
  });
});
