// Period reports built from the wallet ledger (FEAT-046).
const { resetDatabase, prisma } = require('../helpers/reset');
const { resetAuthLimiter, staffAgent, approvedBoardman, fundedBetter, openCompetition } = require('../helpers/fixtures');
const resultService = require('../../server/services/resultService');
const payoutService = require('../../server/services/payoutService');

beforeEach(async () => {
  await resetDatabase();
  await resetAuthLimiter();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('Reports (FEAT-046)', () => {
  it('totals deposits, stakes, winnings and commission from the ledger', async () => {
    const finance = await staffAgent('FINANCE');
    const bm = await approvedBoardman();
    const competition = await openCompetition(bm);
    const b1 = await fundedBetter(60000);
    const b2 = await fundedBetter(40000);
    await b1.agent.post('/api/bets').send({ betOptionId: competition.betOptions[0].id, stake: 60000 });
    await b2.agent.post('/api/bets').send({ betOptionId: competition.betOptions[1].id, stake: 40000 });
    await bm.agent.patch(`/api/competitions/${competition.id}/close-betting`);
    const profile = await prisma.boardmanProfile.findUnique({ where: { id: bm.profileId } });
    await resultService.submitResult(profile, competition.id, { winningOptionId: competition.betOptions[0].id });
    await prisma.competition.update({ where: { id: competition.id }, data: { status: 'RESULT_CONFIRMED' } });
    await payoutService.processPayoutsForCompetition(competition.id);

    const res = await finance.agent.get('/api/admin/reports/summary?groupBy=day');
    expect(res.status).toBe(200);
    const { report } = res.body;
    expect(report.deposits).toEqual({ count: 2, total: '100000.00' });
    expect(report.betting).toEqual({ bets: 2, staked: '100000.00', uniqueBettors: 2 });
    // 100,000 pool, 5% Boardman + 3% platform, the rest to the winner.
    expect(report.commission).toEqual({ platform: '3000.00', boardmen: '5000.00' });
    expect(report.payouts.winnings).toBe('92000.00');
    expect(report.newUsers.BETTER).toBe(2);
    expect(report.daily).toHaveLength(1);
    expect(report.daily[0]).toMatchObject({ staked: '100000.00', winnings: '92000.00', platformCommission: '3000.00', deposits: '100000.00' });
  });

  it('validates the range and is hidden from support staff', async () => {
    const finance = await staffAgent('FINANCE');
    const support = await staffAgent('SUPPORT');

    expect((await finance.agent.get('/api/admin/reports/summary?from=2026-05-01&to=2026-04-01')).status).toBe(422);
    expect((await finance.agent.get('/api/admin/reports/summary?from=2020-01-01&to=2026-01-01')).status).toBe(422);
    expect((await support.agent.get('/api/admin/reports/summary')).status).toBe(403);
  });
});
